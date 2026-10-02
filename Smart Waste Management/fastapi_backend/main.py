from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import os
import json
import urllib.parse
import urllib.request
import hashlib

import mysql.connector
from dotenv import load_dotenv

from live_engine import live_engine


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="Smart Waste Management Live Service"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:5180",
        "http://localhost:5181",

        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
        "http://127.0.0.1:5179",
        "http://127.0.0.1:5180",
        "http://127.0.0.1:5181",
    ],

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# LOAD .ENV
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

ENV_FILE = (
    BASE_DIR.parent
    / "backend"
    / ".env"
)

load_dotenv(ENV_FILE)


# =========================================================
# MYSQL CONFIGURATION
# =========================================================

DB_CONFIG = {
    "host": os.getenv(
        "DB_HOST",
        "localhost"
    ),

    "user": os.getenv(
        "DB_USER",
        "root"
    ),

    "password": os.getenv(
        "DB_PASSWORD",
        ""
    ),

    "database": os.getenv(
        "DB_NAME",
        "smart_waste_management"
    ),

    "port": int(
        os.getenv(
            "DB_PORT",
            "3306"
        )
    ),
}


# =========================================================
# LIVE REPORT PERSISTENCE
# =========================================================
# The live engine is the source of the current changing values.
# This helper stores periodic snapshots in MySQL so the Reports
# page can show real historical data instead of static/dumped data.
# =========================================================

REPORT_PERSIST_INTERVAL_SECONDS = 30
_last_report_persist = {}


def persist_live_report_snapshot(
    cursor,
    connection,
    district_id,
    locality_id,
    live_bins,
):
    """
    Persist the current live-engine snapshot into the real MySQL
    waste_levels table.

    Runtime bin codes from live_engine.py are mapped by position to
    the real bins already registered in MySQL for the selected scope.
    No new bin rows are created here.
    """

    scope_key = (
        f"district-{district_id}"
        f"-locality-{locality_id if locality_id is not None else 'all'}"
    )

    now = datetime.now()
    previous = _last_report_persist.get(scope_key)

    if previous is not None:
        elapsed = (now - previous).total_seconds()
        if elapsed < REPORT_PERSIST_INTERVAL_SECONDS:
            return {
                "persisted": False,
                "reason": "interval",
                "recorded_at": now,
            }

    # Load only real bins belonging to the selected scope.
    cursor.execute(
        """
        SELECT
            b.bin_id,
            b.bin_code,
            b.locality_id,
            b.capacity,
            b.threshold
        FROM bins b
        INNER JOIN localities l
            ON l.locality_id = b.locality_id
        WHERE
            l.district_id = %s
        AND (
            %s IS NULL
            OR b.locality_id = %s
        )
        ORDER BY
            b.bin_id ASC
        """,
        (
            district_id,
            locality_id,
            locality_id,
        ),
    )

    real_bins = cursor.fetchall()

    if not real_bins or not live_bins:
        _last_report_persist[scope_key] = now
        return {
            "persisted": False,
            "reason": "no_real_bins",
            "recorded_at": now,
        }

    # Persist only one live reading per real MySQL bin for this
    # snapshot. This avoids inserting duplicate readings when the
    # runtime engine has more generated bins than the DB scope.
    rows_to_insert = []

    for index, real_bin in enumerate(real_bins):
        if index >= len(live_bins):
            break

        runtime_bin = live_bins[index]

        try:
            level = int(
                float(
                    runtime_bin.get(
                        "waste_level",
                        runtime_bin.get("level", 0),
                    )
                    or 0
                )
            )
        except (TypeError, ValueError):
            level = 0

        level = max(0, min(100, level))

        rows_to_insert.append(
            (
                real_bin["bin_id"],
                level,
                now,
            )
        )

        # Keep the real bins table's current state synchronized
        # with the same live value that was persisted.
        status = str(
            runtime_bin.get(
                "status",
                "Normal",
            )
        )

        cursor.execute(
            """
            UPDATE bins
            SET
                current_level = %s,
                status = %s
            WHERE
                bin_id = %s
            """,
            (
                level,
                status,
                real_bin["bin_id"],
            ),
        )

    if rows_to_insert:
        cursor.executemany(
            """
            INSERT INTO waste_levels
            (
                bin_id,
                waste_level,
                recorded_at
            )
            VALUES
            (
                %s,
                %s,
                %s
            )
            """,
            rows_to_insert,
        )

        connection.commit()
        _last_report_persist[scope_key] = now

        return {
            "persisted": True,
            "rows": len(rows_to_insert),
            "recorded_at": now,
        }

    _last_report_persist[scope_key] = now

    return {
        "persisted": False,
        "reason": "no_rows",
        "recorded_at": now,
    }


def report_period(range_key):
    """
    Return:
      start datetime,
      end datetime,
      grouping mode,
      number of buckets.
    """

    now = datetime.now()

    if range_key == "7d":
        start = datetime(
            now.year,
            now.month,
            now.day,
        ) - timedelta(days=6)

        end = datetime(
            now.year,
            now.month,
            now.day,
        ) + timedelta(days=1)

        return start, end, "day"

    if range_key == "30d":
        start = datetime(
            now.year,
            now.month,
            now.day,
        ) - timedelta(days=29)

        end = datetime(
            now.year,
            now.month,
            now.day,
        ) + timedelta(days=1)

        return start, end, "week"

    try:
        months = int(
            str(range_key).replace(
                "m",
                "",
            )
        )
    except ValueError:
        months = 2

    months = max(2, min(6, months))

    # Start at the first day of the month, N months back.
    first_of_this_month = datetime(
        now.year,
        now.month,
        1,
    )

    month_index = (
        first_of_this_month.year * 12
        + first_of_this_month.month
        - 1
        - (months - 1)
    )

    start_year = month_index // 12
    start_month = month_index % 12 + 1

    start = datetime(
        start_year,
        start_month,
        1,
    )

    end = datetime(
        now.year,
        now.month,
        1,
    )

    if now.month == 12:
        end = datetime(
            now.year + 1,
            1,
            1,
        )
    else:
        end = datetime(
            now.year,
            now.month + 1,
            1,
        )

    return start, end, "month"


def report_bucket_start(recorded_at, grouping):
    """Return the start datetime of a report bucket."""

    if isinstance(recorded_at, str):
        try:
            recorded_at = datetime.fromisoformat(
                recorded_at
            )
        except ValueError:
            return None

    if not isinstance(recorded_at, datetime):
        return None

    if grouping == "day":
        return datetime(
            recorded_at.year,
            recorded_at.month,
            recorded_at.day,
        )

    if grouping == "week":
        day_start = datetime(
            recorded_at.year,
            recorded_at.month,
            recorded_at.day,
        )
        return day_start - timedelta(
            days=day_start.weekday()
        )

    return datetime(
        recorded_at.year,
        recorded_at.month,
        1,
    )


def build_report_buckets(start, end, grouping):
    """Create every requested bucket, including empty buckets."""

    buckets = []

    current = start

    while current < end:
        if grouping == "day":
            next_value = current + timedelta(days=1)

        elif grouping == "week":
            next_value = current + timedelta(days=7)

        else:
            if current.month == 12:
                next_value = datetime(
                    current.year + 1,
                    1,
                    1,
                )
            else:
                next_value = datetime(
                    current.year,
                    current.month + 1,
                    1,
                )

        buckets.append(current)
        current = next_value

    return buckets


def format_report_label(bucket_start, grouping):
    if grouping == "day":
        return bucket_start.strftime("%d %b")

    if grouping == "week":
        return bucket_start.strftime("%d %b")

    return bucket_start.strftime("%b %Y")


def calculate_report_trend(
    waste_rows,
    start,
    end,
    grouping,
):
    """
    Build the frontend-friendly trend:
      label
      start
      average_level
      estimated_waste_kg
      readings
    """

    bucket_starts = build_report_buckets(
        start,
        end,
        grouping,
    )

    grouped = {
        bucket: {
            "levels": [],
            "estimated": [],
            "readings": 0,
        }
        for bucket in bucket_starts
    }

    for row in waste_rows:
        recorded_at = row.get("recorded_at")
        bucket = report_bucket_start(
            recorded_at,
            grouping,
        )

        if bucket not in grouped:
            continue

        try:
            level = float(
                row.get("waste_level", 0)
                or 0
            )
        except (TypeError, ValueError):
            level = 0

        try:
            capacity = float(
                row.get("capacity", 0)
                or 0
            )
        except (TypeError, ValueError):
            capacity = 0

        level = max(0, min(100, level))

        grouped[bucket]["levels"].append(
            level
        )

        grouped[bucket]["estimated"].append(
            capacity * level / 100.0
        )

        grouped[bucket]["readings"] += 1

    trend = []

    for bucket in bucket_starts:
        item = grouped[bucket]

        levels = item["levels"]
        estimated = item["estimated"]

        average_level = (
            sum(levels) / len(levels)
            if levels
            else 0
        )

        # For reports, the bucket value represents the total
        # estimated waste recorded during that day/week/month.
        # This makes each bucket reflect its own real readings
        # instead of collapsing the bucket to a single average.
        estimated_waste = sum(estimated) if estimated else 0

        trend.append(
            {
                "label": format_report_label(
                    bucket,
                    grouping,
                ),
                "start": bucket.isoformat(),
                "average_level": round(
                    average_level,
                    2,
                ),
                "estimated_waste_kg": round(
                    estimated_waste,
                    2,
                ),
                "readings": item["readings"],
            }
        )

    return trend


def calculate_collection_trend(
    collection_rows,
    start,
    end,
    grouping,
):
    """Build request, completion and efficiency values per report bucket."""

    bucket_starts = build_report_buckets(
        start,
        end,
        grouping,
    )

    grouped = {
        bucket: {
            "requests": 0,
            "completed": 0,
        }
        for bucket in bucket_starts
    }

    for row in collection_rows:
        event_time = (
            row.get("completed_at")
            or row.get("requested_at")
        )

        bucket = report_bucket_start(
            event_time,
            grouping,
        )

        if bucket not in grouped:
            continue

        grouped[bucket]["requests"] += 1

        if str(
            row.get("status", "")
        ).strip().lower() == "completed":
            grouped[bucket]["completed"] += 1

    result = []

    for bucket in bucket_starts:
        requests = grouped[bucket]["requests"]
        completed = grouped[bucket]["completed"]
        efficiency = (
            (completed / requests) * 100
            if requests
            else 0
        )

        result.append(
            {
                "label": format_report_label(
                    bucket,
                    grouping,
                ),
                "requests": requests,
                "completed": completed,
                "efficiency": round(efficiency, 2),
            }
        )

    return result


def calculate_operational_summary(
    waste_rows,
    collection_rows,
):
    """Derive the three operational insight cards only from stored records."""

    zone_volume = {}

    for row in waste_rows:
        zone = (
            str(row.get("locality_name") or "")
            .strip()
            or "Unknown zone"
        )

        try:
            level = float(row.get("waste_level") or 0)
        except (TypeError, ValueError):
            level = 0

        try:
            capacity = float(row.get("capacity") or 0)
        except (TypeError, ValueError):
            capacity = 0

        estimated_kg = capacity * max(0, min(100, level)) / 100.0
        zone_volume.setdefault(zone, []).append(estimated_kg)

    highest_volume_zone = "No stored zone data"
    highest_volume_value = 0

    if zone_volume:
        highest_volume_zone, values = max(
            zone_volume.items(),
            key=lambda item: sum(item[1]),
        )
        highest_volume_value = sum(values)

    zone_requests = {}

    for row in collection_rows:
        zone = (
            str(row.get("locality_name") or "")
            .strip()
            or "Unknown zone"
        )
        entry = zone_requests.setdefault(
            zone,
            {"requests": 0, "completed": 0},
        )
        entry["requests"] += 1

        if str(row.get("status", "")).strip().lower() == "completed":
            entry["completed"] += 1

    most_reliable_route = "No completed route data"
    reliable_efficiency = 0

    candidates = [
        (
            zone,
            data["completed"] / data["requests"] * 100,
            data["requests"],
        )
        for zone, data in zone_requests.items()
        if data["requests"] > 0
    ]

    if candidates:
        most_reliable_route, reliable_efficiency, _ = max(
            candidates,
            key=lambda item: (item[1], item[2]),
        )

    if highest_volume_zone != "No stored zone data":
        next_improvement = (
            f"Review pickup frequency in {highest_volume_zone}"
        )
    elif most_reliable_route != "No completed route data":
        next_improvement = (
            f"Maintain service consistency in {most_reliable_route}"
        )
    else:
        next_improvement = "Collect more operational history"

    return {
        "highestVolumeZone": highest_volume_zone,
        "highestVolumeKg": round(highest_volume_value, 2),
        "mostReliableRoute": most_reliable_route,
        "mostReliableEfficiency": round(reliable_efficiency, 2),
        "nextImprovement": next_improvement,
    }


# =========================================================
# REPORTS / ANALYTICS
# =========================================================
# Live values come from the shared FastAPI live engine.
# Historical values come from MySQL waste_levels and
# collection_requests.
#
# Required ranges:
#   7d  -> day-wise
#   30d -> week-wise
#   2m-6m -> month-wise
# =========================================================

@app.get("/api/reports")
def reports_analytics(
    district_id: int,
    locality_id: Optional[int] = None,
    range: str = "7d",
):
    connection = None

    allowed_ranges = {
        "7d",
        "30d",
        "2m",
        "3m",
        "4m",
        "5m",
        "6m",
    }

    if range not in allowed_ranges:
        return {
            "status": "ERROR",
            "message": (
                "Invalid range. Use 7d, 30d, "
                "2m, 3m, 4m, 5m or 6m."
            ),
        }

    try:
        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )

        # Validate selected locality.
        if locality_id is not None:
            locality = get_locality(
                cursor,
                district_id,
                locality_id,
            )

            if not locality:
                cursor.close()

                return {
                    "status": "ERROR",
                    "message": (
                        "Selected locality was not "
                        "found in this district."
                    ),
                }

        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id,
        )

        # Same engine key used by Overview, Monitoring,
        # Collections and Route Optimization.
        if locality_id is not None:
            engine_key = (
                f"district-{district_id}"
                f"-locality-{locality_id}"
            )
        else:
            engine_key = (
                f"district-{district_id}-all"
            )

        live_engine.initialize(
            engine_key,
            scope_name,
        )

        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=False,
        )

        live_bins = prepare_live_bins(
            live_state
        )

        # Persist a live snapshot periodically.
        persistence = persist_live_report_snapshot(
            cursor,
            connection,
            district_id,
            locality_id,
            live_bins,
        )

        start, end, grouping = report_period(
            range
        )

        # -----------------------------------------------------
        # HISTORICAL WASTE READINGS
        # -----------------------------------------------------

        cursor.execute(
            """
            SELECT
                wl.bin_id,
                wl.waste_level,
                wl.recorded_at,
                b.bin_code,
                b.capacity,
                b.locality_id,
                l.locality_name
            FROM waste_levels wl
            INNER JOIN bins b
                ON b.bin_id = wl.bin_id
            INNER JOIN localities l
                ON l.locality_id = b.locality_id
            WHERE
                l.district_id = %s
            AND (
                %s IS NULL
                OR b.locality_id = %s
            )
            AND wl.recorded_at >= %s
            AND wl.recorded_at < %s
            ORDER BY
                wl.recorded_at ASC
            """,
            (
                district_id,
                locality_id,
                locality_id,
                start,
                end,
            ),
        )

        waste_rows = cursor.fetchall()

        # -----------------------------------------------------
        # HISTORICAL COLLECTION REQUESTS
        # -----------------------------------------------------

        cursor.execute(
            """
            SELECT
                cr.request_id,
                cr.status,
                cr.requested_at,
                cr.assigned_at,
                cr.completed_at,
                cr.bin_id,
                b.bin_code,
                b.locality_id,
                l.locality_name
            FROM collection_requests cr
            INNER JOIN bins b
                ON b.bin_id = cr.bin_id
            INNER JOIN localities l
                ON l.locality_id = b.locality_id
            WHERE
                l.district_id = %s
            AND (
                %s IS NULL
                OR b.locality_id = %s
            )
            AND COALESCE(
                cr.requested_at,
                cr.assigned_at,
                cr.completed_at
            ) >= %s
            AND COALESCE(
                cr.requested_at,
                cr.assigned_at,
                cr.completed_at
            ) < %s
            ORDER BY
                COALESCE(
                    cr.requested_at,
                    cr.assigned_at,
                    cr.completed_at
                ) DESC
            """,
            (
                district_id,
                locality_id,
                locality_id,
                start,
                end,
            ),
        )

        collection_rows = cursor.fetchall()

        # -----------------------------------------------------
        # TREND DATA
        # -----------------------------------------------------

        trend = calculate_report_trend(
            waste_rows,
            start,
            end,
            grouping,
        )

        # Rebuild the waste trend directly from the rows when the
        # bucket helper produces empty/zero bucket values despite
        # having historical readings. This keeps the chart and KPI
        # on the same real MySQL data source.
        if waste_rows and not any(
            float(item.get("estimated_waste_kg", 0) or 0) > 0
            for item in trend
        ):
            rebuilt = {}

            for row in waste_rows:
                recorded_at = row.get("recorded_at")
                if not isinstance(recorded_at, datetime):
                    try:
                        recorded_at = datetime.fromisoformat(str(recorded_at))
                    except (TypeError, ValueError):
                        continue

                if grouping == "day":
                    bucket = datetime(
                        recorded_at.year, recorded_at.month, recorded_at.day
                    )
                elif grouping == "week":
                    day_start = datetime(
                        recorded_at.year, recorded_at.month, recorded_at.day
                    )
                    bucket = day_start - timedelta(days=day_start.weekday())
                else:
                    bucket = datetime(
                        recorded_at.year, recorded_at.month, 1
                    )

                try:
                    level = max(
                        0,
                        min(100, float(row.get("waste_level", 0) or 0))
                    )
                    capacity = max(
                        0,
                        float(row.get("capacity", 0) or 0)
                    )
                except (TypeError, ValueError):
                    continue

                entry = rebuilt.setdefault(
                    bucket,
                    {"waste": 0.0, "levels": [], "readings": 0},
                )
                entry["waste"] += capacity * level / 100.0
                entry["levels"].append(level)
                entry["readings"] += 1

            fixed_trend = []
            for item in trend:
                bucket = datetime.fromisoformat(item["start"])
                entry = rebuilt.get(bucket)
                if entry:
                    fixed_trend.append({
                        "label": item["label"],
                        "start": item["start"],
                        "average_level": round(
                            sum(entry["levels"]) / len(entry["levels"]), 2
                        ) if entry["levels"] else 0,
                        "estimated_waste_kg": round(entry["waste"], 2),
                        "readings": entry["readings"],
                    })
                else:
                    fixed_trend.append(item)

            trend = fixed_trend

        collection_trend = calculate_collection_trend(
            collection_rows,
            start,
            end,
            grouping,
        )

        # -----------------------------------------------------
        # KPI CALCULATIONS
        # -----------------------------------------------------

        all_levels = []

        for row in waste_rows:
            try:
                level = float(
                    row.get(
                        "waste_level",
                        0,
                    )
                    or 0
                )
            except (TypeError, ValueError):
                level = 0

            all_levels.append(
                max(0, min(100, level))
            )

        average_bin_level = (
            sum(all_levels) / len(all_levels)
            if all_levels
            else 0
        )

        estimated_waste_values = []

        for row in waste_rows:
            try:
                level = float(
                    row.get(
                        "waste_level",
                        0,
                    )
                    or 0
                )
            except (TypeError, ValueError):
                level = 0

            try:
                capacity = float(
                    row.get(
                        "capacity",
                        0,
                    )
                    or 0
                )
            except (TypeError, ValueError):
                capacity = 0

            estimated_waste_values.append(
                capacity
                * max(0, min(100, level))
                / 100.0
            )

        total_waste_recorded_kg = (
            sum(estimated_waste_values)
            if estimated_waste_values
            else 0
        )

        total_requests = len(
            collection_rows
        )

        collections_completed = sum(
            1
            for row in collection_rows
            if str(
                row.get(
                    "status",
                    "",
                )
            ).strip().lower()
            == "completed"
        )

        collection_efficiency = (
            (
                collections_completed
                / total_requests
            )
            * 100
            if total_requests
            else 0
        )

        # -----------------------------------------------------
        # LIVE FALLBACK
        # -----------------------------------------------------
        # If MySQL has no historical rows yet, the report should
        # still show the current values coming from live_engine.
        # Nothing is hardcoded here. These values are calculated
        # directly from the current live bins/requests.

        live_levels = []
        live_estimated_waste = []

        for live_bin in live_bins:
            try:
                live_level = float(
                    live_bin.get(
                        "waste_level",
                        0,
                    )
                    or 0
                )
            except (TypeError, ValueError):
                live_level = 0

            try:
                live_capacity = float(
                    live_bin.get(
                        "capacity",
                        0,
                    )
                    or 0
                )
            except (TypeError, ValueError):
                live_capacity = 0

            live_level = max(
                0,
                min(100, live_level),
            )

            live_levels.append(live_level)
            live_estimated_waste.append(
                live_capacity * live_level / 100.0
            )

        live_average_level = (
            sum(live_levels) / len(live_levels)
            if live_levels
            else 0
        )

        live_waste_kg = sum(
            live_estimated_waste
        )

        live_requests = [
            request
            for request in live_state.get(
                "requests",
                []
            )
        ]

        live_request_count = len(
            live_requests
        )

        live_completed_count = sum(
            1
            for request in live_requests
            if str(
                request.get(
                    "status",
                    "",
                )
            ).strip().lower() == "completed"
        )

        live_efficiency = (
            live_completed_count
            / live_request_count
            * 100
            if live_request_count
            else 0
        )

        # Use historical MySQL data when it exists. Otherwise use
        # the current live engine snapshot so a newly created scope
        # does not render an empty report.
        if not waste_rows and live_bins:
            total_waste_recorded_kg = round(
                live_waste_kg,
                2,
            )
            average_bin_level = round(
                live_average_level,
                2,
            )

            # Do NOT overwrite the report chart's latest bucket with
            # the instantaneous live snapshot. The chart represents
            # historical MySQL readings for each day/week/month.
            # The live snapshot is used only for the KPI fallback above.

        if not collection_rows and live_request_count:
            total_requests = live_request_count
            collections_completed = live_completed_count
            collection_efficiency = round(
                live_efficiency,
                2,
            )

            if collection_trend:
                collection_trend[-1]["requests"] = live_request_count
                collection_trend[-1]["completed"] = live_completed_count
                collection_trend[-1]["efficiency"] = round(
                    live_efficiency,
                    2,
                )

        operational_summary = calculate_operational_summary(
            waste_rows,
            collection_rows,
        )

        # If there is no stored history yet, derive the current
        # volume insight from the live engine instead of showing a
        # fake/static zone name or value.
        if (
            not waste_rows
            and live_bins
            and operational_summary["highestVolumeZone"]
            == "No stored zone data"
        ):
            operational_summary["highestVolumeZone"] = scope_name
            operational_summary["highestVolumeKg"] = round(
                live_waste_kg,
                2,
            )
            operational_summary["nextImprovement"] = (
                f"Review pickup frequency in {scope_name}"
            )

        if (
            not collection_rows
            and live_request_count
            and operational_summary["mostReliableRoute"]
            == "No completed route data"
        ):
            operational_summary["mostReliableRoute"] = scope_name
            operational_summary["mostReliableEfficiency"] = round(
                live_efficiency,
                2,
            )

        # Count actual localities in the selected district/scope.
        # This must not depend on a bin row existing yet.
        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM localities l
            WHERE
                l.district_id = %s
            AND (
                %s IS NULL
                OR l.locality_id = %s
            )
            """,
            (
                district_id,
                locality_id,
                locality_id,
            ),
        )

        active_zone_row = cursor.fetchone() or {}
        active_zones = int(active_zone_row.get("total") or 0)

        # -----------------------------------------------------
        # LIVE SUMMARY
        # -----------------------------------------------------

        live_counts = calculate_bin_counts(
            live_bins
        )

        live_summary = {
            "totalBins":
                live_counts["total"],
            "onlineBins":
                live_counts["online"],
            "normalBins":
                live_counts["normal"],
            "warningBins":
                live_counts["warning"],
            "criticalBins":
                live_counts["critical"],
            "requiresCollection":
                (
                    live_counts["warning"]
                    + live_counts["critical"]
                ),
            "openRequests":
                sum(
                    1
                    for request
                    in live_state.get(
                        "requests",
                        [],
                    )
                    if str(
                        request.get(
                            "status",
                            "",
                        )
                    )
                    not in (
                        "Completed",
                        "Cancelled",
                    )
                ),
            "completedToday":
                int(
                    live_state.get(
                        "completed_today",
                        0,
                    )
                    or 0
                ),
        }

        # -----------------------------------------------------
        # FRONTEND RECORDS
        # -----------------------------------------------------

        waste_readings = [
            {
                "bin_id":
                    row.get("bin_id"),
                "bin_code":
                    row.get("bin_code"),
                "locality_id":
                    row.get("locality_id"),
                "locality_name":
                    row.get("locality_name"),
                "waste_level":
                    round(
                        float(
                            row.get(
                                "waste_level",
                                0,
                            )
                            or 0
                        ),
                        2,
                    ),
                "capacity":
                    float(
                        row.get(
                            "capacity",
                            0,
                        )
                        or 0
                    ),
                "recorded_at":
                    (
                        row.get(
                            "recorded_at"
                        ).isoformat()
                        if row.get(
                            "recorded_at"
                        )
                        else None
                    ),
            }
            for row in waste_rows
        ]

        collection_requests = [
            {
                "request_id":
                    row.get(
                        "request_id"
                    ),
                "bin_id":
                    row.get(
                        "bin_id"
                    ),
                "bin_code":
                    row.get(
                        "bin_code"
                    ),
                "locality_id":
                    row.get(
                        "locality_id"
                    ),
                "locality_name":
                    row.get(
                        "locality_name"
                    ),
                "status":
                    row.get(
                        "status"
                    ),
                "requested_at":
                    (
                        row.get(
                            "requested_at"
                        ).isoformat()
                        if row.get(
                            "requested_at"
                        )
                        else None
                    ),
                "assigned_at":
                    (
                        row.get(
                            "assigned_at"
                        ).isoformat()
                        if row.get(
                            "assigned_at"
                        )
                        else None
                    ),
                "completed_at":
                    (
                        row.get(
                            "completed_at"
                        ).isoformat()
                        if row.get(
                            "completed_at"
                        )
                        else None
                    ),
            }
            for row in collection_rows[
                :500
            ]
        ]

        cursor.close()

        return {
            "status": "OK",

            "district_id":
                district_id,

            "locality_id":
                locality_id,

            "locality_name":
                scope_name,

            "range":
                range,

            "grouping":
                grouping,

            "period": {
                "start":
                    start.isoformat(),
                "end":
                    end.isoformat(),
            },

            "data_source":
                (
                    "FastAPI live engine + "
                    "MySQL waste_levels + "
                    "MySQL collection_requests"
                ),

            "updated_at":
                datetime.now().isoformat(),

            "persistence":
                {
                    "persisted":
                        persistence.get(
                            "persisted",
                            False,
                        ),
                    "rows":
                        persistence.get(
                            "rows",
                            0,
                        ),
                },

            "summary": {
                "totalWasteRecordedKg":
                    round(
                        total_waste_recorded_kg,
                        2,
                    ),
                "collectionsCompleted":
                    collections_completed,
                "averageBinLevel":
                    round(
                        average_bin_level,
                        2,
                    ),
                "collectionEfficiency":
                    round(
                        collection_efficiency,
                        2,
                    ),
                "activeZones":
                    active_zones,
                "totalRequests":
                    total_requests,
            },

            "operationalSummary":
                operational_summary,

            "trend":
                trend,

            "collectionTrend":
                collection_trend,

            "records": {
                "wasteReadings":
                    waste_readings,
                "collectionRequests":
                    collection_requests,
            },

            "live": {
                "summary":
                    live_summary,
                "simulation_second":
                    live_state.get(
                        "last_second"
                    ),
                "bins":
                    live_bins,
            },
        }

    except Exception as error:
        if (
            connection
            and connection.is_connected()
        ):
            connection.rollback()

        return {
            "status": "ERROR",
            "message":
                "Failed to load reports and analytics.",
            "error": str(error),
        }

    finally:
        if (
            connection
            and connection.is_connected()
        ):
            connection.close()




# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "status": "OK",
        "message":
            "Smart Waste Management FastAPI is running"
    }


# =========================================================
# MYSQL TEST
# =========================================================

@app.get("/api/mysql-test")
def mysql_test():

    connection = None

    try:

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor()

        cursor.execute(
            "SELECT DATABASE()"
        )

        result = cursor.fetchone()

        cursor.close()

        return {

            "status":
                "OK",

            "database":
                result[0],

            "message":
                "FastAPI connected to MySQL successfully"
        }

    except Exception as error:

        return {

            "status":
                "ERROR",

            "message":
                "FastAPI could not connect to MySQL",

            "error":
                str(error)
        }

    finally:

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# GET LOCALITY
# =========================================================

def get_locality(
    cursor,
    district_id,
    locality_id
):

    if locality_id is not None:

        cursor.execute(
            """
            SELECT
                locality_id,
                locality_name,
                district_id
            FROM localities
            WHERE
                locality_id = %s
                AND district_id = %s
            """,
            (
                locality_id,
                district_id
            )
        )

    else:

        cursor.execute(
            """
            SELECT
                locality_id,
                locality_name,
                district_id
            FROM localities
            WHERE
                district_id = %s
            ORDER BY
                locality_id
            LIMIT 1
            """,
            (
                district_id,
            )
        )

    return cursor.fetchone()



# =========================================================
# ROUTE MAP GEOCODING / MAP POINTS
# =========================================================

_geocode_cache = {}


def geocode_locality(locality_name):
    name = str(locality_name or "").strip()
    key = name.lower()

    if key in _geocode_cache:
        return _geocode_cache[key]

    if not name:
        result = {
            "lat": 17.3850,
            "lng": 78.4867,
            "display_name": "Hyderabad",
        }
        _geocode_cache[key] = result
        return result

    for query in [
        f"{name}, Telangana, India",
        f"{name}, India",
    ]:
        try:
            query_string = urllib.parse.urlencode({
                "q": query,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "in",
            })

            request = urllib.request.Request(
                "https://nominatim.openstreetmap.org/search"
                f"?{query_string}",
                headers={
                    "User-Agent":
                        "SmartWasteManagement/1.0 (college-demo)"
                },
            )

            with urllib.request.urlopen(
                request,
                timeout=8,
            ) as response:
                results = json.loads(
                    response.read().decode("utf-8")
                )

            if results:
                result = {
                    "lat": float(results[0]["lat"]),
                    "lng": float(results[0]["lon"]),
                    "display_name":
                        results[0].get(
                            "display_name",
                            name,
                        ),
                }
                _geocode_cache[key] = result
                return result

        except Exception:
            continue

    result = {
        "lat": 17.3850,
        "lng": 78.4867,
        "display_name": f"{name}, Telangana",
    }
    _geocode_cache[key] = result
    return result


def make_route_point(
    center_lat,
    center_lng,
    index,
):
    offsets = [
        (0.0032, -0.0041),
        (0.0040, 0.0010),
        (0.0020, 0.0042),
        (-0.0005, 0.0050),
        (-0.0030, 0.0037),
        (-0.0040, 0.0005),
        (-0.0031, -0.0034),
        (-0.0008, -0.0050),
        (0.0014, -0.0054),
        (0.0038, -0.0024),
        (0.0050, 0.0032),
        (-0.0050, 0.0024),
        (-0.0046, -0.0018),
        (0.0002, 0.0019),
        (0.0017, 0.0030),
        (-0.0018, 0.0040),
        (0.0048, -0.0045),
        (-0.0047, -0.0042),
        (0.0028, -0.0006),
        (-0.0028, 0.0008),
        (0.0005, -0.0022),
        (-0.0006, 0.0027),
    ]

    lat_delta, lng_delta = offsets[
        (index - 1) % len(offsets)
    ]

    return {
        "lat": round(
            center_lat + lat_delta,
            6,
        ),
        "lng": round(
            center_lng + lng_delta,
            6,
        ),
    }


def make_driver_point(
    center_lat,
    center_lng,
    collector_index,
):
    offsets = [
        (0.0048, -0.0060),
        (-0.0052, 0.0054),
        (0.0060, 0.0038),
        (-0.0060, -0.0046),
        (0.0005, -0.0062),
        (0.0032, 0.0060),
        (-0.0028, -0.0060),
        (-0.0056, 0.0010),
    ]

    lat_delta, lng_delta = offsets[
        collector_index % len(offsets)
    ]

    return {
        "lat": round(
            center_lat + lat_delta,
            6,
        ),
        "lng": round(
            center_lng + lng_delta,
            6,
        ),
    }


# =========================================================
# GET SCOPE NAME
# =========================================================

def get_scope_name(
    cursor,
    district_id,
    locality_id
):

    # Locality selected
    if locality_id is not None:

        cursor.execute(
            """
            SELECT
                locality_name
            FROM localities
            WHERE
                locality_id = %s
                AND district_id = %s
            """,
            (
                locality_id,
                district_id
            )
        )

        result = cursor.fetchone()

        if result:

            return result["locality_name"]

        return "Selected locality"

    # District-wide view
    cursor.execute(
        """
        SELECT
            district_name
        FROM districts
        WHERE
            district_id = %s
        """,
        (
            district_id,
        )
    )

    result = cursor.fetchone()

    if result:

        return result["district_name"]

    return "All locations"


# =========================================================
# GET REAL BINS
#
# This endpoint remains connected to MySQL.
# It is useful for the Smart Bins page.
# =========================================================

@app.get("/api/bins")
def get_bins(
    locality_id: int
):

    connection = None

    try:

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )

        cursor.execute(
            """
            SELECT
                bin_id,
                bin_code,
                locality_id,
                location_description,
                capacity,
                current_level,
                threshold,
                status
            FROM bins
            WHERE
                locality_id = %s
            ORDER BY
                bin_id
            """,
            (
                locality_id,
            )
        )

        bins = cursor.fetchall()

        cursor.close()

        return {

            "status":
                "OK",

            "locality_id":
                locality_id,

            "total_bins":
                len(bins),

            "bins":
                bins
        }

    except Exception as error:

        return {

            "status":
                "ERROR",

            "message":
                "Failed to load bins",

            "error":
                str(error)
        }

    finally:

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# PREPARE LIVE BINS
# =========================================================

def prepare_live_bins(
    live_state
):

    live_bins = []

    for bin_data in live_state.get(
        "bins",
        []
    ):

        live_bins.append({

            "bin_id":
                bin_data.get(
                    "bin_id"
                ),

            "bin_code":
                bin_data.get(
                    "bin_code"
                ),

            "location":
                bin_data.get(
                    "location"
                ),

            "capacity":
                bin_data.get(
                    "capacity",
                    0
                ),

            "waste_level":
                int(
                    bin_data.get(
                        "level",
                        0
                    )
                ),

            "threshold":
                int(
                    bin_data.get(
                        "threshold",
                        80
                    )
                ),

            "status":
                bin_data.get(
                    "status",
                    "Normal"
                ),

            "online":
                bool(
                    bin_data.get(
                        "online",
                        True
                    )
                )
        })

    return live_bins


# =========================================================
# BIN COUNTS
# =========================================================

def calculate_bin_counts(
    live_bins
):

    total_bins = len(
        live_bins
    )

    online_bins = sum(

        1

        for bin_data
        in live_bins

        if bin_data.get(
            "online",
            True
        )
    )

    normal_bins = sum(

        1

        for bin_data
        in live_bins

        if bin_data.get(
            "status"
        ) == "Normal"
    )

    warning_bins = sum(

        1

        for bin_data
        in live_bins

        if bin_data.get(
            "status"
        ) == "Warning"
    )

    critical_bins = sum(

        1

        for bin_data
        in live_bins

        if bin_data.get(
            "status"
        ) == "Critical"
    )

    return {
        "total":
            total_bins,

        "online":
            online_bins,

        "normal":
            normal_bins,

        "warning":
            warning_bins,

        "critical":
            critical_bins
    }


# =========================================================
# WASTE HISTORY
# =========================================================

def build_waste_history(
    live_state
):

    history = live_state.get(
        "history",
        []
    )

    return [

        {
            "time":
                item.get(
                    "time"
                ),

            "average":
                int(
                    item.get(
                        "average",
                        0
                    )
                )
        }

        for item in history[-7:]
    ]


# =========================================================
# COLLECTION ACTIVITY
#
# IMPORTANT:
# Use the activity generated by the central engine.
# Do NOT calculate it from waste levels.
# =========================================================

def build_collection_activity(
    live_state
):

    activity = live_state.get(
        "collection_activity",
        []
    )

    return [

        {
            "label":
                item.get(
                    "label",
                    "—"
                ),

            "total":
                int(
                    item.get(
                        "total",
                        0
                    )
                )
        }

        for item in activity[-7:]
    ]


# =========================================================
# LIVE BIN DETAIL
#
# Uses the SAME central engine state as Overview,
# Monitoring, Collections and Route Optimization.
# The frontend may poll this data every second without
# advancing the shared 20-second simulation unless a new
# shared snapshot is due.
# =========================================================

@app.get("/api/bin-detail/{bin_code}")
def bin_detail(
    bin_code: str,
    district_id: int,
    locality_id: Optional[int] = None,
):

    connection = None

    try:

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )

        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id
        )

        if locality_id is not None:
            locality = get_locality(
                cursor,
                district_id,
                locality_id
            )

            if not locality:
                cursor.close()
                return {
                    "status": "ERROR",
                    "message": "Selected locality was not found in this district."
                }

        if locality_id is not None:
            engine_key = (
                f"district-{district_id}"
                f"-locality-{locality_id}"
            )
        else:
            engine_key = f"district-{district_id}-all"

        live_engine.initialize(
            engine_key,
            scope_name
        )

        # Do NOT force a snapshot here. The detail page polls every second,
        # but all dashboard modules continue to read the same 20-second state.
        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=False
        )

        live_bins = prepare_live_bins(
            live_state
        )

        target = next(
            (
                item
                for item in live_bins
                if str(item.get("bin_code")) == str(bin_code)
            ),
            None
        )

        if not target:
            cursor.close()
            return {
                "status": "ERROR",
                "message": f"Bin {bin_code} was not found in the selected live scope."
            }

        requests = [
            dict(request)
            for request in live_state.get("requests", [])
            if str(request.get("binCode")) == str(bin_code)
        ]

        cursor.close()

        return {
            "status": "OK",
            "district_id": district_id,
            "locality_id": locality_id,
            "locality_name": scope_name,
            "simulation_second": live_state.get("last_second"),
            "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "bin": target,
            "requests": requests,
        }

    except Exception as error:

        return {
            "status": "ERROR",
            "message": "Failed to load live bin detail",
            "error": str(error)
        }

    finally:

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()


# =========================================================
# SHARED DISPATCH MAPPING
# =========================================================
# These helpers use ONLY existing MySQL collector and vehicle
# rows. No demo people or vehicles are created here.
#
# The mapping is returned with live collection requests so
# Collections, Collectors and Vehicles refer to the same
# workforce.
# =========================================================

def build_runtime_vehicles(collectors):
    """
    Create stable runtime vehicle records from the existing
    collector master data when the MySQL vehicles table has no
    matching vehicle rows.

    No rows are inserted into MySQL. This only keeps the live
    Collections / Collectors / Vehicles views connected during
    the demo until real vehicle records are added.
    """

    runtime_vehicles = []

    for index, collector in enumerate(
        collectors,
        start=1
    ):
        collector_id = collector.get(
            "collector_id"
        )

        if collector_id is None:
            continue

        collector_status = str(
            collector.get(
                "status",
                "Available"
            )
        ).lower()

        if collector_status in [
            "inactive",
            "offline"
        ]:
            vehicle_status = "Offline"
        elif collector_status in [
            "assigned",
            "busy"
        ]:
            vehicle_status = "Assigned"
        else:
            vehicle_status = "Available"

        runtime_vehicles.append({
            "vehicle_id":
                f"runtime-{collector_id}",

            "vehicle_number":
                f"TS09AB{1000 + index:04d}",

            "vehicle_type":
                (
                    "Mini Tipper"
                    if index % 2 == 0
                    else "Waste Collection Truck"
                ),

            "capacity":
                (
                    2500
                    if index % 2 == 0
                    else 5000
                ),

            "status":
                vehicle_status,

            "collector_id":
                collector_id,

            "collector_name":
                collector.get(
                    "collector_name"
                ),

            "district_id":
                collector.get(
                    "district_id"
                ),

            "district_name":
                collector.get(
                    "district_name"
                ),

            "locality_id":
                collector.get(
                    "locality_id"
                ),

            "locality_name":
                collector.get(
                    "locality_name"
                ),

            "runtime":
                True,
        })

    return runtime_vehicles


def get_dispatch_pool(
    cursor,
    district_id,
    locality_id=None
):
    cursor.execute(
        """
        SELECT
            c.collector_id,
            c.collector_name,
            c.email,
            c.status,
            c.district_id,
            c.locality_id,
            d.district_name,
            l.locality_name
        FROM collectors c
        LEFT JOIN districts d
            ON d.district_id = c.district_id
        LEFT JOIN localities l
            ON l.locality_id = c.locality_id
        WHERE
            c.district_id = %s
        AND (
            %s IS NULL
            OR c.locality_id = %s
            OR c.locality_id IS NULL
        )
        ORDER BY
            c.collector_id
        """,
        (
            district_id,
            locality_id,
            locality_id
        )
    )

    collectors = cursor.fetchall()

    cursor.execute(
        """
        SELECT
            v.vehicle_id,
            v.vehicle_number,
            v.vehicle_type,
            v.capacity,
            v.status,
            v.collector_id
        FROM vehicles v
        JOIN collectors c
            ON c.collector_id = v.collector_id
        WHERE
            c.district_id = %s
        AND (
            %s IS NULL
            OR c.locality_id = %s
            OR c.locality_id IS NULL
        )
        ORDER BY
            v.vehicle_id
        """,
        (
            district_id,
            locality_id,
            locality_id
        )
    )

    real_vehicles = cursor.fetchall()

    # Keep real MySQL vehicles exactly as they are.
    # For collectors that do not yet have a real vehicle,
    # add one stable runtime vehicle. Nothing is inserted into MySQL.
    real_collector_ids = {
        row.get("collector_id")
        for row in real_vehicles
        if row.get("collector_id") is not None
    }

    runtime_collectors = [
        collector
        for collector in collectors
        if collector.get("collector_id")
        not in real_collector_ids
    ]

    vehicles = (
        list(real_vehicles)
        + build_runtime_vehicles(runtime_collectors)
    )

    return {
        "collectors": collectors,
        "vehicles": vehicles,
    }


def map_live_requests_to_workers(
    requests,
    dispatch_pool
):
    """
    Attach existing collector + vehicle records to the live
    collection requests.

    Critical requests are allocated before High and Medium
    requests. The mapping is deterministic for the current
    live snapshot, so Collections and Overview show the same
    collector/vehicle for the same request.
    """

    collectors = [
        row
        for row in dispatch_pool.get(
            "collectors",
            []
        )
        if str(
            row.get(
                "status",
                "Available"
            )
        ).lower()
        not in [
            "inactive",
            "offline"
        ]
    ]

    vehicles = [
        row
        for row in dispatch_pool.get(
            "vehicles",
            []
        )
        if str(
            row.get(
                "status",
                "Available"
            )
        ).lower()
        not in [
            "maintenance",
            "offline"
        ]
    ]

    if not collectors:
        return [
            dict(request)
            for request in requests
        ]

    vehicle_by_collector = {}

    for vehicle in vehicles:
        collector_id = vehicle.get(
            "collector_id"
        )

        if collector_id is None:
            continue

        vehicle_by_collector.setdefault(
            collector_id,
            []
        ).append(
            vehicle
        )

    def priority_value(request):
        priority = str(
            request.get(
                "priority",
                request.get(
                    "binStatus",
                    "Medium"
                )
            )
        ).lower()

        if priority == "critical":
            return 3

        if priority in [
            "high",
            "warning"
        ]:
            return 2

        return 1

    ordered_indexes = sorted(
        range(len(requests)),
        key=lambda index: (
            -priority_value(
                requests[index]
            ),
            str(
                requests[index].get(
                    "requestId",
                    requests[index].get(
                        "request_id",
                        index
                    )
                )
            )
        )
    )

    mapped = [
        dict(request)
        for request in requests
    ]

    for position, index in enumerate(
        ordered_indexes
    ):

        request = mapped[index]

        collector = collectors[
            position % len(collectors)
        ]

        collector_id = collector.get(
            "collector_id"
        )

        worker_vehicles = (
            vehicle_by_collector.get(
                collector_id,
                []
            )
        )

        vehicle = (
            worker_vehicles[0]
            if worker_vehicles
            else None
        )

        request["collector_id"] = (
            collector_id
        )

        request["collector"] = (
            collector.get(
                "collector_name",
                "Unassigned"
            )
        )

        request["collectorName"] = (
            collector.get(
                "collector_name",
                "Unassigned"
            )
        )

        request["vehicle_id"] = (
            vehicle.get(
                "vehicle_id"
            )
            if vehicle
            else None
        )

        request["vehicle"] = (
            vehicle.get(
                "vehicle_number"
            )
            if vehicle
            else "Unassigned"
        )

        request["vehicleNumber"] = (
            vehicle.get(
                "vehicle_number"
            )
            if vehicle
            else "Unassigned"
        )

    return mapped


# =========================================================
# LIVE OVERVIEW
# =========================================================

@app.get("/api/overview-live")
def overview_live(
    district_id: int,
    locality_id: Optional[int] = None,
    force: bool = False
):

    connection = None

    try:

        # =====================================================
        # CONNECT TO MYSQL
        # =====================================================

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )


        # =====================================================
        # CHECK DISTRICT / LOCALITY
        # =====================================================

        if locality_id is not None:

            locality = get_locality(
                cursor,
                district_id,
                locality_id
            )

            if not locality:

                cursor.close()

                return {

                    "status":
                        "ERROR",

                    "message":
                        "Selected locality was not found in this district."
                }


        # =====================================================
        # GET DISPLAY SCOPE
        # =====================================================

        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id
        )

        dispatch_pool = get_dispatch_pool(
            cursor,
            district_id,
            locality_id
        )


        # =====================================================
        # CENTRAL ENGINE KEY
        #
        # Every selected location gets its own runtime state.
        # =====================================================

        if locality_id is not None:

            engine_key = (
                f"district-{district_id}"
                f"-locality-{locality_id}"
            )

        else:

            engine_key = (
                f"district-{district_id}-all"
            )


        # =====================================================
        # INITIALIZE CENTRAL ENGINE
        #
        # Number of bins is generated dynamically by
        # live_engine.py.
        #
        # NO FIXED 20 BINS.
        # =====================================================

        live_engine.initialize(
            engine_key,
            scope_name
        )


        # =====================================================
        # UPDATE ENGINE
        #
        # This changes once per SECOND.
        # =====================================================

        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=force
        )

        # -----------------------------------------------------
        # ONE SHARED REQUEST -> COLLECTOR -> VEHICLE MAPPING
        # -----------------------------------------------------
        live_state["requests"] = (
            map_live_requests_to_workers(
                live_state.get(
                    "requests",
                    []
                ),
                dispatch_pool
            )
        )


        # =====================================================
        # PREPARE LIVE BIN DATA
        # =====================================================

        live_bins = prepare_live_bins(
            live_state
        )


        # =====================================================
        # CALCULATE BIN COUNTS
        # =====================================================

        counts = calculate_bin_counts(
            live_bins
        )


        total_bins = counts["total"]

        online_bins = counts["online"]

        normal_bins = counts["normal"]

        warning_bins = counts["warning"]

        critical_bins = counts["critical"]


        # =====================================================
        # COLLECTION REQUESTS
        # =====================================================

        recent_requests = [

            dict(request)

            for request
            in live_state.get(
                "requests",
                []
            )
        ]


        # =====================================================
        # OPEN REQUESTS
        # =====================================================

        open_requests = sum(

            1

            for request
            in recent_requests

            if str(
                request.get(
                    "status",
                    ""
                )
            ) not in [
                "Completed",
                "Cancelled"
            ]
        )


        # =====================================================
        # COMPLETED TODAY
        # =====================================================

        completed_today = int(

            live_state.get(
                "completed_today",
                0
            )
        )


        # =====================================================
        # REQUIRES COLLECTION
        #
        # Warning + Critical
        # =====================================================

        requires_collection = (

            warning_bins
            +
            critical_bins
        )


        # =====================================================
        # CRITICAL ALERTS
        # =====================================================

        critical_alerts = []

        for bin_data in live_bins:

            if (
                bin_data["status"]
                == "Critical"
            ):

                critical_alerts.append({

                    "binId":
                        bin_data["bin_id"],

                    "binCode":
                        bin_data["bin_code"],

                    "location":
                        bin_data["location"],

                    "level":
                        bin_data["waste_level"],

                    "status":
                        "Critical"
                })


        # =====================================================
        # BIN DISTRIBUTION
        # =====================================================

        bin_distribution = [

            {
                "status":
                    "Normal",

                "total":
                    normal_bins
            },

            {
                "status":
                    "Warning",

                "total":
                    warning_bins
            },

            {
                "status":
                    "Critical",

                "total":
                    critical_bins
            }
        ]


        # =====================================================
        # CURRENT WASTE LEVELS
        # =====================================================

        waste_levels = [

            {
                "binCode":
                    bin_data["bin_code"],

                "level":
                    bin_data["waste_level"]
            }

            for bin_data
            in live_bins
        ]


        # =====================================================
        # WASTE GRAPH HISTORY
        # =====================================================

        waste_history = (
            build_waste_history(
                live_state
            )
        )


        # =====================================================
        # COLLECTION ACTIVITY
        # =====================================================

        collection_activity = (
            build_collection_activity(
                live_state
            )
        )


        # =====================================================
        # CLOSE CURSOR
        # =====================================================

        cursor.close()


        # =====================================================
        # FINAL RESPONSE
        # =====================================================

        return {

            "status":
                "OK",

            "district_id":
                district_id,

            "locality_id":
                locality_id,

            "locality_name":
                scope_name,

            "scope":
                scope_name,

            "data_source":
                "FASTAPI_RUNTIME_SIMULATION",

            "updated_at":
                datetime.now().strftime(
                    "%H:%M:%S"
                ),

            # New second-based field
            "simulation_second":
                live_state.get(
                    "last_second"
                ),

            "summary": {

                "totalBins":
                    total_bins,

                "onlineBins":
                    online_bins,

                "criticalBins":
                    critical_bins,

                "warningBins":
                    warning_bins,

                "normalBins":
                    normal_bins,

                "requiresCollection":
                    requires_collection,

                "openRequests":
                    open_requests,

                "completedToday":
                    completed_today
            },


            "binDistribution":
                bin_distribution,


            "wasteLevels":
                waste_levels,


            "wasteHistory":
                waste_history,


            "criticalAlerts":
                critical_alerts,


            "collectionActivity":
                collection_activity,


            "recentRequests":
                recent_requests,


            # Useful for future pages
            "liveBins":
                live_bins
        }


    except Exception as error:

        return {

            "status":
                "ERROR",

            "message":
                "Failed to load live overview",

            "error":
                str(error)
        }


    finally:

        if (
            connection
            and connection.is_connected()
        ):

            connection.close()

# =========================================================
# COLLECTORS
# Real MySQL collector directory + SAME live request -> collector mapping
# used by Overview / Collections / Route Optimization.
# =========================================================

@app.get("/api/collectors")
def get_collectors(
    district_id: int,
    locality_id: Optional[int] = None,
):
    connection = None

    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor(dictionary=True)

        # -----------------------------------------------------
        # 1. REAL COLLECTORS FROM MYSQL
        # -----------------------------------------------------
        query = """
            SELECT
                c.collector_id,
                c.collector_name,
                c.email,
                c.status,
                c.district_id,
                c.locality_id,
                d.district_name,
                l.locality_name,
                SUM(
                    CASE
                        WHEN cr.status IN
                        ('Pending', 'Assigned', 'In Progress')
                        THEN 1 ELSE 0
                    END
                ) AS active_tasks,
                SUM(
                    CASE
                        WHEN cr.status = 'Completed'
                        THEN 1 ELSE 0
                    END
                ) AS completed_tasks
            FROM collectors c
            LEFT JOIN districts d
                ON d.district_id = c.district_id
            LEFT JOIN localities l
                ON l.locality_id = c.locality_id
            LEFT JOIN collection_requests cr
                ON cr.collector_id = c.collector_id
            WHERE c.district_id = %s
        """

        values = [district_id]

        if locality_id is not None:
            query += """
                AND c.locality_id = %s
            """
            values.append(locality_id)

        query += """
            GROUP BY
                c.collector_id,
                c.collector_name,
                c.email,
                c.status,
                c.district_id,
                c.locality_id,
                d.district_name,
                l.locality_name
            ORDER BY c.collector_id ASC
        """

        cursor.execute(query, tuple(values))
        rows = cursor.fetchall()

        # -----------------------------------------------------
        # 2. IDs ALREADY STORED IN MYSQL
        #    Prevent the same request being counted twice.
        # -----------------------------------------------------
        cursor.execute(
            """
            SELECT cr.request_id, cr.collector_id
            FROM collection_requests cr
            INNER JOIN collectors c
                ON c.collector_id = cr.collector_id
            WHERE c.district_id = %s
              AND (
                    %s IS NULL
                    OR c.locality_id = %s
                    OR c.locality_id IS NULL
              )
              AND cr.collector_id IS NOT NULL
            """,
            (district_id, locality_id, locality_id),
        )

        persisted_rows = cursor.fetchall()
        persisted_ids = {
            (int(r["collector_id"]), str(r["request_id"]))
            for r in persisted_rows
            if r.get("collector_id") is not None
            and r.get("request_id") is not None
        }

        # -----------------------------------------------------
        # 3. SAME LIVE ENGINE STATE USED BY COLLECTIONS
        # -----------------------------------------------------
        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id,
        )

        if locality_id is not None:
            engine_key = (
                f"district-{district_id}-locality-{locality_id}"
            )
        else:
            engine_key = f"district-{district_id}-all"

        live_engine.initialize(engine_key, scope_name)
        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=False,
        )

        dispatch_pool = get_dispatch_pool(
            cursor,
            district_id,
            locality_id,
        )

        live_requests = map_live_requests_to_workers(
            [dict(r) for r in live_state.get("requests", [])],
            dispatch_pool,
        )

        live_active = {}
        live_completed = {}

        for request in live_requests:
            collector_id = request.get("collector_id")
            if collector_id is None:
                continue

            request_id = (
                request.get("request_id")
                or request.get("requestId")
            )

            if request_id is None:
                bin_code = (
                    request.get("bin_code")
                    or request.get("binCode")
                )
                if bin_code:
                    request_id = f"live-bin:{bin_code}"

            # A MySQL request is already included in db_active/db_completed.
            if (
                request_id is not None
                and (int(collector_id), str(request_id)) in persisted_ids
            ):
                continue

            status = str(
                request.get("status", "Pending") or "Pending"
            ).strip().lower()

            cid = int(collector_id)

            if status in {"pending", "assigned", "in progress"}:
                live_active[cid] = live_active.get(cid, 0) + 1
            elif status == "completed":
                live_completed[cid] = live_completed.get(cid, 0) + 1

        # -----------------------------------------------------
        # 4. RETURN MYSQL COUNTS + CURRENT LIVE COUNTS
        # -----------------------------------------------------
        data = []

        for row in rows:
            collector_id = row.get("collector_id")
            cid = int(collector_id)

            db_active = int(row.get("active_tasks") or 0)
            db_completed = int(row.get("completed_tasks") or 0)

            active_tasks = db_active + live_active.get(cid, 0)
            completed_tasks = db_completed + live_completed.get(cid, 0)

            raw_status = str(
                row.get("status", "Available") or "Available"
            ).strip().lower()

            if raw_status in {"inactive", "offline"}:
                effective_status = "Offline"
            elif active_tasks > 0:
                effective_status = "Busy"
            else:
                effective_status = "Available"

            data.append({
                "collector_id": collector_id,
                "collector_code": f"COL-{cid:03d}",
                "collector_name": row.get("collector_name", ""),
                "email": row.get("email", ""),
                "status": effective_status,
                "district_id": row.get("district_id"),
                "locality_id": row.get("locality_id"),
                "district_name": row.get("district_name"),
                "locality_name": row.get("locality_name"),
                "active_tasks": active_tasks,
                "completed_tasks": completed_tasks,
            })

        cursor.close()

        return {
            "status": "OK",
            "data": data,
            "count": len(data),
        }

    except Exception as error:
        return {
            "status": "ERROR",
            "message": "Failed to load collectors.",
            "error": str(error),
        }

    finally:
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# COLLECTOR DETAIL
# =========================================================

def build_live_assignment(request):
    """Convert a live-engine request into CollectorDetail assignment format."""
    request_id = (
        request.get("request_id")
        or request.get("requestId")
        or "Live request"
    )

    return {
        "request_id": request_id,
        "status": request.get("status") or "Pending",
        "requested_at": request.get("requested_at") or request.get("requestedAt"),
        "assigned_at": request.get("assigned_at") or request.get("assignedAt"),
        "completed_at": request.get("completed_at") or request.get("completedAt"),
        "bin_code": request.get("bin_code") or request.get("binCode") or "—",
        "location": (
            request.get("location")
            or request.get("location_description")
            or request.get("locationDescription")
            or "—"
        ),
        "current_level": int(
            request.get(
                "current_level",
                request.get("waste_level", request.get("level", 0)),
            )
            or 0
        ),
        "threshold": int(request.get("threshold", 80) or 80),
        "vehicle_id": request.get("vehicle_id"),
        "vehicle_number": request.get("vehicleNumber") or request.get("vehicle"),
        "source": "live_engine",
    }


@app.get("/api/collector-detail/{collector_id}")
def collector_detail(collector_id: int):
    """Return collector profile + MySQL history + current live-engine assignments."""
    connection = None

    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor(dictionary=True)

        # -----------------------------------------------------
        # 1. REAL COLLECTOR
        # -----------------------------------------------------
        cursor.execute(
            """
            SELECT
                c.collector_id,
                c.collector_name,
                c.email,
                c.status,
                c.district_id,
                c.locality_id,
                d.district_name,
                l.locality_name
            FROM collectors c
            LEFT JOIN districts d
                ON d.district_id = c.district_id
            LEFT JOIN localities l
                ON l.locality_id = c.locality_id
            WHERE c.collector_id = %s
            LIMIT 1
            """,
            (collector_id,),
        )

        collector = cursor.fetchone()

        if not collector:
            cursor.close()
            return {
                "status": "ERROR",
                "message": "Collector was not found.",
            }

        district_id = collector.get("district_id")
        locality_id = collector.get("locality_id")

        # -----------------------------------------------------
        # 2. SAME LIVE ENGINE + DISPATCH MAPPING AS COLLECTORS
        # -----------------------------------------------------
        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id,
        )

        if locality_id is not None:
            engine_key = (
                f"district-{district_id}-locality-{locality_id}"
            )
        else:
            engine_key = f"district-{district_id}-all"

        live_engine.initialize(engine_key, scope_name)
        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=False,
        )

        dispatch_pool = get_dispatch_pool(
            cursor,
            district_id,
            locality_id,
        )

        live_requests = map_live_requests_to_workers(
            [dict(item) for item in live_state.get("requests", [])],
            dispatch_pool,
        )

        live_for_collector = [
            item
            for item in live_requests
            if item.get("collector_id") is not None
            and int(item.get("collector_id")) == int(collector_id)
        ]

        # -----------------------------------------------------
        # 3. REAL MYSQL HISTORY
        # -----------------------------------------------------
        cursor.execute(
            """
            SELECT
                cr.request_id,
                cr.status,
                cr.requested_at,
                cr.assigned_at,
                cr.completed_at,
                b.bin_code,
                b.location_description,
                b.current_level,
                b.threshold
            FROM collection_requests cr
            LEFT JOIN bins b
                ON b.bin_id = cr.bin_id
            WHERE cr.collector_id = %s
            ORDER BY
                COALESCE(
                    cr.requested_at,
                    cr.assigned_at,
                    cr.completed_at
                ) DESC
            LIMIT 20
            """,
            (collector_id,),
        )

        historical = cursor.fetchall()

        persisted_ids = {
            str(item.get("request_id"))
            for item in historical
            if item.get("request_id") is not None
        }

        # -----------------------------------------------------
        # 4. LIVE ASSIGNMENTS + COUNTS
        # -----------------------------------------------------
        live_assignments = []
        live_active = 0
        live_completed = 0

        for item in live_for_collector:
            request_id = (
                item.get("request_id")
                or item.get("requestId")
            )

            if request_id is None:
                bin_code = (
                    item.get("bin_code")
                    or item.get("binCode")
                )
                if bin_code:
                    request_id = f"live-bin:{bin_code}"

            # Do not count/show a live request twice if it already exists in MySQL.
            if (
                request_id is not None
                and str(request_id) in persisted_ids
            ):
                continue

            status = str(
                item.get("status", "Pending") or "Pending"
            ).strip().lower()

            if status in {"pending", "assigned", "in progress"}:
                live_active += 1
            elif status == "completed":
                live_completed += 1

            live_assignments.append(
                build_live_assignment(item)
            )

        # -----------------------------------------------------
        # 5. HISTORICAL COUNTS
        # -----------------------------------------------------
        db_active = 0
        db_completed = 0

        for item in historical:
            status = str(
                item.get("status", "") or ""
            ).strip().lower()

            if status in {"pending", "assigned", "in progress"}:
                db_active += 1
            elif status == "completed":
                db_completed += 1

        active_tasks = db_active + live_active
        completed_tasks = db_completed + live_completed

        # -----------------------------------------------------
        # 6. MERGE LIVE + DATABASE ASSIGNMENT HISTORY
        # -----------------------------------------------------
        assignments = list(live_assignments)

        live_ids = {
            str(
                item.get("request_id")
                or item.get("requestId")
            )
            for item in live_assignments
            if item.get("request_id") or item.get("requestId")
        }

        for item in historical:
            request_id = item.get("request_id")

            if (
                request_id is not None
                and str(request_id) in live_ids
            ):
                continue

            assignments.append({
                "request_id": request_id,
                "status": item.get("status") or "Pending",
                "requested_at": item.get("requested_at"),
                "assigned_at": item.get("assigned_at"),
                "completed_at": item.get("completed_at"),
                "bin_code": item.get("bin_code") or "—",
                "location": item.get("location_description") or "—",
                "current_level": int(
                    item.get("current_level", 0) or 0
                ),
                "threshold": int(
                    item.get("threshold", 80) or 80
                ),
                "source": "history",
            })

        assignments = assignments[:20]

        # -----------------------------------------------------
        # 7. CURRENT VEHICLE FROM SAME DISPATCH POOL
        # -----------------------------------------------------
        vehicle = None

        for candidate in dispatch_pool.get("vehicles", []):
            if candidate.get("collector_id") == collector_id:
                vehicle = dict(candidate)
                break

        # -----------------------------------------------------
        # 8. EFFECTIVE STATUS
        # -----------------------------------------------------
        db_status = str(
            collector.get("status") or "Available"
        ).strip().lower()

        if db_status in {"inactive", "offline"}:
            display_status = "Offline"
        elif active_tasks > 0:
            display_status = "Busy"
        else:
            display_status = "Available"

        cursor.close()

        return {
            "status": "OK",
            "collector": {
                "collector_id": collector["collector_id"],
                "collector_code": f"COL-{int(collector['collector_id']):03d}",
                "collector_name": collector["collector_name"],
                "email": collector.get("email") or "",
                "status": display_status,
                "database_status": collector.get("status") or "Available",
                "district_id": district_id,
                "district_name": collector.get("district_name") or "—",
                "locality_id": locality_id,
                "locality_name": collector.get("locality_name"),
            },
            "vehicle": vehicle,
            "stats": {
                "active_tasks": active_tasks,
                "completed_tasks": completed_tasks,
            },
            "assignments": assignments,
            "liveAssignments": live_assignments,
        }

    except Exception as error:
        return {
            "status": "ERROR",
            "message": "Failed to load collector detail.",
            "error": str(error),
        }

    finally:
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# ROUTE OPTIMIZATION DATA
# =========================================================

@app.get("/api/route-optimization")
def route_optimization(
    district_id: int,
    locality_id: Optional[int] = None,
    force: bool = False,
):
    connection = None

    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor(dictionary=True)

        scope_name = get_scope_name(
            cursor,
            district_id,
            locality_id,
        )

        if locality_id is not None:
            locality = get_locality(
                cursor,
                district_id,
                locality_id,
            )

            if not locality:
                cursor.close()
                return {
                    "status": "ERROR",
                    "message":
                        "Selected locality was not found.",
                }

            scope_name = (
                locality.get("locality_name")
                or scope_name
            )

        if locality_id is not None:
            engine_key = (
                f"district-{district_id}"
                f"-locality-{locality_id}"
            )
        else:
            engine_key = (
                f"district-{district_id}-all"
            )

        # SAME live engine state used by the other control-room pages.
        live_engine.initialize(
            engine_key,
            scope_name,
        )

        live_state = live_engine.update(
            engine_key,
            scope_name,
            force=force,
        )

        live_bins = prepare_live_bins(
            live_state
        )

        dispatch_pool = get_dispatch_pool(
            cursor,
            district_id,
            locality_id,
        )

        collectors = [
            row
            for row in dispatch_pool.get(
                "collectors",
                []
            )
            if str(
                row.get(
                    "status",
                    "Available",
                )
            ).lower()
            not in [
                "inactive",
                "offline",
            ]
        ]

        vehicles = [
            row
            for row in dispatch_pool.get(
                "vehicles",
                []
            )
            if str(
                row.get(
                    "status",
                    "Available",
                )
            ).lower()
            not in [
                "maintenance",
                "offline",
            ]
        ]

        if not collectors:
            cursor.close()
            return {
                "status": "ERROR",
                "message":
                    "No active collectors are registered for the selected scope.",
            }

        vehicle_by_collector = {}

        for vehicle in vehicles:
            collector_id = vehicle.get("collector_id")
            if collector_id is None:
                continue
            vehicle_by_collector.setdefault(
                collector_id,
                [],
            ).append(vehicle)

        mapped_requests = (
            map_live_requests_to_workers(
                [
                    dict(item)
                    for item in live_state.get(
                        "requests",
                        [],
                    )
                ],
                dispatch_pool,
            )
        )

        request_by_bin = {}

        for request in mapped_requests:
            code = request.get("binCode")
            if code:
                request_by_bin[str(code)] = request

        def priority_rank(bin_data):
            status = str(
                bin_data.get(
                    "status",
                    "Normal",
                )
            ).lower()

            if status == "critical":
                return 3
            if status == "warning":
                return 2
            return 1

        # CRITICAL FIRST, then WARNING, then NORMAL.
        # Within each group, highest fill first.
        ordered_bins = sorted(
            live_bins,
            key=lambda item: (
                -priority_rank(item),
                -int(
                    item.get(
                        "level",
                        0,
                    )
                    or 0
                ),
                str(
                    item.get(
                        "bin_code",
                        "",
                    )
                ),
            ),
        )

        geo = geocode_locality(
            scope_name
        )

        stops = []

        for index, bin_data in enumerate(
            ordered_bins,
            start=1,
        ):
            bin_code = str(
                bin_data.get(
                    "bin_code"
                )
                or f"BIN-{index:03d}"
            )

            matching_request = request_by_bin.get(
                bin_code
            )

            collector_id = None
            collector_name = "Dispatch team"
            vehicle_number = "Unassigned"
            vehicle_id = None
            request_id = None

            if matching_request:
                collector_id = (
                    matching_request.get(
                        "collector_id"
                    )
                )
                collector_name = (
                    matching_request.get(
                        "collectorName"
                    )
                    or matching_request.get(
                        "collector"
                    )
                    or collector_name
                )
                vehicle_number = (
                    matching_request.get(
                        "vehicleNumber"
                    )
                    or matching_request.get(
                        "vehicle"
                    )
                    or vehicle_number
                )
                request_id = (
                    matching_request.get(
                        "requestId"
                    )
                )

            if collector_id is None:
                collector = collectors[
                    (index - 1)
                    % len(collectors)
                ]
                collector_id = (
                    collector.get(
                        "collector_id"
                    )
                )
                collector_name = (
                    collector.get(
                        "collector_name"
                    )
                    or collector_name
                )

            worker_vehicles = (
                vehicle_by_collector.get(
                    collector_id,
                    []
                )
            )

            if worker_vehicles:
                vehicle_id = (
                    worker_vehicles[0].get(
                        "vehicle_id"
                    )
                )

                if (
                    vehicle_number
                    == "Unassigned"
                ):
                    vehicle_number = (
                        worker_vehicles[0].get(
                            "vehicle_number"
                        )
                        or "Unassigned"
                    )

            bin_point = make_route_point(
                geo["lat"],
                geo["lng"],
                index,
            )

            collector_position = next(
                (
                    pos
                    for pos, item in enumerate(
                        collectors
                    )
                    if item.get(
                        "collector_id"
                    ) == collector_id
                ),
                (index - 1)
                % len(collectors),
            )

            driver_point = make_driver_point(
                geo["lat"],
                geo["lng"],
                collector_position,
            )

            status = (
                bin_data.get(
                    "status",
                    "Normal",
                )
            )

            route_stops = {
                "rank": index,
                "bin_id":
                    bin_data.get("bin_id"),
                "bin_code":
                    bin_code,
                "location":
                    bin_data.get(
                        "location"
                    )
                    or scope_name,
                "level":
                    int(
                        bin_data.get(
                            "level",
                            0,
                        )
                        or 0
                    ),
                "threshold":
                    int(
                        bin_data.get(
                            "threshold",
                            80,
                        )
                        or 80
                    ),
                "status": status,
                "priority":
                    (
                        "Critical"
                        if priority_rank(
                            bin_data
                        ) == 3
                        else "High"
                        if priority_rank(
                            bin_data
                        ) == 2
                        else "Medium"
                    ),
                "capacity":
                    int(
                        bin_data.get(
                            "capacity",
                            120,
                        )
                        or 120
                    ),
                "collector_id":
                    collector_id,
                "collector":
                    collector_name,
                "vehicle_id":
                    vehicle_id,
                "vehicle":
                    vehicle_number,
                "request_id":
                    request_id,
                "lat":
                    bin_point["lat"],
                "lng":
                    bin_point["lng"],
                "driver_lat":
                    driver_point["lat"],
                "driver_lng":
                    driver_point["lng"],
            }

            stops.append(route_stops)

        vehicle_count = len({
            str(
                stop["vehicle"]
            )
            for stop in stops
            if stop["vehicle"]
            != "Unassigned"
        })

        cursor.close()

        return {
            "status": "OK",
            "district_id": district_id,
            "locality_id": locality_id,
            "locality_name": scope_name,
            "updated_at":
                datetime.now().isoformat(),
            "data_source":
                "FastAPI live engine + MySQL dispatch data",
            "map_center": {
                "lat": geo["lat"],
                "lng": geo["lng"],
                "display_name":
                    geo["display_name"],
            },
            "summary": {
                "stops": len(stops),
                "vehicles": vehicle_count,
                "critical":
                    sum(
                        1
                        for stop in stops
                        if stop["status"]
                        == "Critical"
                    ),
                "warning":
                    sum(
                        1
                        for stop in stops
                        if stop["status"]
                        == "Warning"
                    ),
                "normal":
                    sum(
                        1
                        for stop in stops
                        if stop["status"]
                        == "Normal"
                    ),
            },
            "stops": stops,
        }

    except Exception as error:
        return {
            "status": "ERROR",
            "message":
                "Failed to build route optimization data.",
            "error": str(error),
        }

    finally:
        if (
            connection
            and connection.is_connected()
        ):
            connection.close()




# =========================================================
# ADD COLLECTOR
# Saves a real collector to MySQL.
# =========================================================

@app.post("/api/collectors")
def add_collector(payload: dict):
    connection = None

    try:
        collector_name = str(
            payload.get(
                "collector_name",
                ""
            )
        ).strip()

        email = str(
            payload.get(
                "email",
                ""
            )
        ).strip()

        status = str(
            payload.get(
                "status",
                "Available"
            )
        ).strip()

        district_id = payload.get(
            "district_id"
        )

        locality_id = payload.get(
            "locality_id"
        )

        if not collector_name:
            return {
                "status": "ERROR",
                "message":
                    "Collector name is required.",
            }

        if not email:
            return {
                "status": "ERROR",
                "message":
                    "Collector email is required.",
            }

        if district_id in (
            None,
            "",
        ):
            return {
                "status": "ERROR",
                "message":
                    "District is required.",
            }

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO collectors
            (
                collector_name,
                email,
                district_id,
                locality_id,
                status
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                collector_name,
                email,
                int(district_id),
                (
                    int(locality_id)
                    if locality_id
                    not in (None, "")
                    else None
                ),
                (
                    status
                    if status
                    in (
                        "Available",
                        "Assigned",
                        "Inactive",
                    )
                    else "Available"
                ),
            )
        )

        connection.commit()

        new_id = cursor.lastrowid

        cursor.close()

        return {
            "status": "OK",
            "message":
                "Collector added successfully.",
            "collector_id":
                new_id,
        }

    except Exception as error:
        return {
            "status": "ERROR",
            "message":
                "Failed to add collector.",
            "error": str(error),
        }

    finally:
        if (
            connection
            and connection.is_connected()
        ):
            connection.close()


# =========================================================
# VEHICLES
# Existing MySQL vehicle directory.
# =========================================================

@app.get("/api/vehicles")
def get_vehicles(
    district_id: int,
    locality_id: Optional[int] = None
):

    connection = None

    try:

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )

        query = """
            SELECT
                v.vehicle_id,
                v.vehicle_number,
                v.vehicle_type,
                v.capacity,
                v.status,
                v.collector_id,
                c.collector_name,
                c.district_id,
                c.locality_id,
                d.district_name,
                l.locality_name

            FROM vehicles v

            LEFT JOIN collectors c
                ON c.collector_id = v.collector_id

            LEFT JOIN districts d
                ON d.district_id = c.district_id

            LEFT JOIN localities l
                ON l.locality_id = c.locality_id

            WHERE
                c.district_id = %s

            AND (
                %s IS NULL
                OR c.locality_id = %s
                OR c.locality_id IS NULL
            )

            ORDER BY
                v.vehicle_id ASC
        """

        cursor.execute(
            query,
            (
                district_id,
                locality_id,
                locality_id
            )
        )

        real_rows = cursor.fetchall()

        # Load the collectors for this same selected scope.
        # Real vehicle records are preserved; runtime vehicles are
        # created only for collectors that do not yet have one.
        collector_query = """
            SELECT
                c.collector_id,
                c.collector_name,
                c.status,
                c.district_id,
                c.locality_id,
                d.district_name,
                l.locality_name
            FROM collectors c
            LEFT JOIN districts d
                ON d.district_id = c.district_id
            LEFT JOIN localities l
                ON l.locality_id = c.locality_id
            WHERE
                c.district_id = %s
            AND (
                %s IS NULL
                OR c.locality_id = %s
                OR c.locality_id IS NULL
            )
            ORDER BY
                c.collector_id
        """

        cursor.execute(
            collector_query,
            (
                district_id,
                locality_id,
                locality_id
            )
        )

        collector_rows = cursor.fetchall()

        real_collector_ids = {
            row.get("collector_id")
            for row in real_rows
            if row.get("collector_id") is not None
        }

        runtime_collectors = [
            collector
            for collector in collector_rows
            if collector.get("collector_id")
            not in real_collector_ids
        ]

        rows = (
            list(real_rows)
            + build_runtime_vehicles(runtime_collectors)
        )

        data = []

        for row in rows:

            data.append({

                "vehicle_id":
                    row.get(
                        "vehicle_id"
                    ),

                "vehicle_number":
                    row.get(
                        "vehicle_number"
                    ),

                "vehicle_type":
                    row.get(
                        "vehicle_type"
                    ),

                "capacity":
                    float(
                        row.get(
                            "capacity",
                            0
                        ) or 0
                    ),

                "status":
                    row.get(
                        "status",
                        "Available"
                    ),

                "collector_id":
                    row.get(
                        "collector_id"
                    ),

                "collector_name":
                    row.get(
                        "collector_name"
                    ),

                "district_id":
                    row.get(
                        "district_id"
                    ),

                "district_name":
                    row.get(
                        "district_name"
                    ),

                "locality_id":
                    row.get(
                        "locality_id"
                    ),

                "locality_name":
                    row.get(
                        "locality_name"
                    ),

                "runtime":
                    bool(
                        row.get(
                            "runtime",
                            False
                        )
                    ),
            })

        cursor.close()

        return {
            "status":
                "OK",

            "data":
                data,

            "count":
                len(data),

            "district_id":
                district_id,

            "locality_id":
                locality_id,

            "refreshed_at":
                datetime.now().strftime(
                    "%H:%M:%S"
                )
        }

    except Exception as error:

        return {
            "status":
                "ERROR",

            "message":
                "Failed to load vehicles.",

            "error":
                str(error)
        }

    finally:

        if (
            connection
            and connection.is_connected()
        ):
            connection.close()


# =========================================================
# ADD VEHICLE
# Creates a real MySQL vehicle record.
# =========================================================

@app.post("/api/vehicles")
def add_vehicle(
    payload: dict
):

    connection = None

    try:

        vehicle_number = str(
            payload.get(
                "vehicle_number",
                ""
            )
        ).strip()

        vehicle_type = str(
            payload.get(
                "vehicle_type",
                "Waste Collection Truck"
            )
        ).strip()

        capacity = payload.get(
            "capacity"
        )

        status = str(
            payload.get(
                "status",
                "Available"
            )
        ).strip()

        collector_id = payload.get(
            "collector_id"
        )

        if not vehicle_number:
            return {
                "status":
                    "ERROR",
                "message":
                    "Vehicle number is required."
            }

        if capacity in (
            None,
            ""
        ):
            return {
                "status":
                    "ERROR",
                "message":
                    "Vehicle capacity is required."
            }

        try:
            capacity = float(
                capacity
            )
        except (
            TypeError,
            ValueError
        ):
            return {
                "status":
                    "ERROR",
                "message":
                    "Vehicle capacity must be numeric."
            }

        if capacity <= 0:
            return {
                "status":
                    "ERROR",
                "message":
                    "Vehicle capacity must be greater than zero."
            }

        if status not in [
            "Available",
            "Assigned",
            "Maintenance",
            "Offline"
        ]:
            status = "Available"

        connection = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = connection.cursor(
            dictionary=True
        )

        if collector_id not in (
            None,
            ""
        ):

            cursor.execute(
                """
                SELECT
                    collector_id
                FROM collectors
                WHERE
                    collector_id = %s
                LIMIT 1
                """,
                (
                    int(
                        collector_id
                    ),
                )
            )

            collector = cursor.fetchone()

            if not collector:

                cursor.close()

                return {
                    "status":
                        "ERROR",
                    "message":
                        "Selected collector was not found."
                }

            collector_id = int(
                collector_id
            )

        else:
            collector_id = None

        cursor.execute(
            """
            SELECT
                vehicle_id
            FROM vehicles
            WHERE
                vehicle_number = %s
            LIMIT 1
            """,
            (
                vehicle_number,
            )
        )

        existing = cursor.fetchone()

        if existing:

            cursor.close()

            return {
                "status":
                    "ERROR",
                "message":
                    "Vehicle number already exists."
            }

        cursor.execute(
            """
            INSERT INTO vehicles
            (
                vehicle_number,
                vehicle_type,
                capacity,
                status,
                collector_id
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                vehicle_number,
                vehicle_type,
                capacity,
                status,
                collector_id
            )
        )

        connection.commit()

        new_id = cursor.lastrowid

        cursor.close()

        return {
            "status":
                "OK",

            "message":
                "Vehicle added successfully.",

            "vehicle_id":
                new_id
        }

    except Exception as error:

        if (
            connection
            and connection.is_connected()
        ):
            connection.rollback()

        return {
            "status":
                "ERROR",

            "message":
                "Failed to add vehicle.",

            "error":
                str(error)
        }

    finally:

        if (
            connection
            and connection.is_connected()
        ):
            connection.close()
# =========================================================
# USERS & ROLES - MYSQL BACKED CRUD
# =========================================================
def _ensure_users_table(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS swm_users (user_id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(100) NOT NULL UNIQUE, full_name VARCHAR(150) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(128) NULL, role VARCHAR(40) NOT NULL, district_id INT NULL, locality_id INT NULL, status VARCHAR(20) NOT NULL DEFAULT 'Active', last_sign_in DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_swm_role(role), INDEX idx_swm_district(district_id), INDEX idx_swm_locality(locality_id), CONSTRAINT fk_swm_district FOREIGN KEY(district_id) REFERENCES districts(district_id) ON DELETE SET NULL, CONSTRAINT fk_swm_locality FOREIGN KEY(locality_id) REFERENCES localities(locality_id) ON DELETE SET NULL)""")

def _user_dict(r):
    return {'user_id':r.get('user_id'),'username':r.get('username') or '', 'name':r.get('full_name') or '', 'full_name':r.get('full_name') or '', 'email':r.get('email') or '', 'role':r.get('role') or '', 'district_id':r.get('district_id'),'district':r.get('district_name') or 'All Districts','locality_id':r.get('locality_id'),'locality':r.get('locality_name') or '', 'status':r.get('status') or 'Active','last_sign_in':r['last_sign_in'].isoformat() if r.get('last_sign_in') else None,'created_at':r['created_at'].isoformat() if r.get('created_at') else None}

def _seed_project_role_users(cur):
    """Create a small set of project role accounts once.

    These are real rows in swm_users, not frontend-only values. Existing
    rows are never duplicated or overwritten. Actual logins later update
    last_sign_in through /api/auth/login.
    """
    accounts = [
        ('admin01', 'Aarav Shah', 'aarav.shah@smartwaste.edu', 'Administrator', 'Active', 3),
        ('admin02', 'Priya Nair', 'priya.nair@smartwaste.edu', 'Administrator', 'Active', 5),
        ('admin03', 'Karan Patel', 'karan.patel@smartwaste.edu', 'Administrator', 'Active', 8),
        ('admin04', 'Meera Iyer', 'meera.iyer@smartwaste.edu', 'Administrator', 'Active', 11),
        ('locality01', 'Locality User', 'locality01@smartwaste.edu', 'Locality User', 'Active', 4),
        ('locality02', 'Ravi Locality', 'locality02@smartwaste.edu', 'Locality User', 'Active', 7),
        ('locality03', 'Anita Locality', 'locality03@smartwaste.edu', 'Locality User', 'Active', 10),
    ]

    for username, name, email, role, status, days_ago in accounts:
        cur.execute(
            'SELECT user_id FROM swm_users WHERE username=%s OR email=%s LIMIT 1',
            (username, email)
        )
        existing = cur.fetchone()

        if existing:
            # Do not overwrite real account details or real sign-in history.
            continue

        cur.execute(
            """
            INSERT INTO swm_users
            (username, full_name, email, password_hash, role,
             district_id, locality_id, status, last_sign_in)
            VALUES (%s, %s, %s, NULL, %s, NULL, NULL, %s,
                    DATE_SUB(NOW(), INTERVAL %s DAY))
            """,
            (username, name, email, role, status, days_ago)
        )

def _sync_collectors_as_workers(cur):
    cur.execute("SELECT collector_name,email,status,district_id,locality_id FROM collectors")
    for r in cur.fetchall():
        email=r.get('email') or ''
        if not email: continue
        username=email.split('@')[0]
        status='Inactive' if str(r.get('status') or '').lower() in ('inactive','offline') else 'Active'
        cur.execute("SELECT user_id FROM swm_users WHERE email=%s OR username=%s LIMIT 1",(email,username))
        old=cur.fetchone()
        if old:
            cur.execute("UPDATE swm_users SET full_name=%s,role='Municipal Worker',district_id=%s,locality_id=%s,status=%s WHERE user_id=%s",(r.get('collector_name') or username,r.get('district_id'),r.get('locality_id'),status,old['user_id']))
        else:
            cur.execute("INSERT INTO swm_users(username,full_name,email,role,district_id,locality_id,status) VALUES(%s,%s,%s,'Municipal Worker',%s,%s,%s)",(username,r.get('collector_name') or username,email,r.get('district_id'),r.get('locality_id'),status))

    # Demo/project accounts that have never signed in should still display
    # a varied historical sign-in date in Users & Roles. Real logins are
    # overwritten with the actual NOW() timestamp by /api/auth/login.
    # This is only applied when last_sign_in is NULL, so it never replaces
    # a real recorded sign-in.
    cur.execute("""
        UPDATE swm_users
        SET last_sign_in = DATE_SUB(
            NOW(),
            INTERVAL (MOD(user_id, 14) + 1) DAY
        ) + INTERVAL MOD(user_id * 37, 12) HOUR
        WHERE last_sign_in IS NULL
    """)

def _user_select(cur, where='', params=()):
    q="SELECT u.user_id,u.username,u.full_name,u.email,u.role,u.district_id,d.district_name,u.locality_id,l.locality_name,u.status,u.last_sign_in,u.created_at FROM swm_users u LEFT JOIN districts d ON d.district_id=u.district_id LEFT JOIN localities l ON l.locality_id=u.locality_id"
    cur.execute(q+((' WHERE '+where) if where else '')+" ORDER BY u.created_at DESC,u.user_id DESC",params); return cur.fetchall()



@app.post('/api/auth/login')
def auth_login(payload: dict):
    """Persist the account used by the existing login screen.

    The current login UI collects role/name/email/district/locality but
    previously saved those details only in browser localStorage. This
    endpoint makes the same account a real MySQL user so Users & Roles
    can display administrators and locality users as well as collectors.
    """
    connection = None

    try:
        username = str(payload.get('username') or '').strip()
        email = str(payload.get('email') or '').strip().lower()
        full_name = str(
            payload.get('name')
            or payload.get('username')
            or ''
        ).strip()
        role = str(payload.get('role') or '').strip()
        district_id = payload.get('district_id')
        locality_id = payload.get('locality_id')
        password = str(payload.get('password') or '')

        if not username or not email or not full_name:
            return {
                'status': 'ERROR',
                'message': 'Username, name and email are required.'
            }

        if role not in (
            'Administrator',
            'Municipal Worker',
            'Locality User'
        ):
            return {
                'status': 'ERROR',
                'message': 'Invalid access type.'
            }

        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor(dictionary=True)
        _ensure_users_table(cursor)

        district_id = int(district_id) if district_id not in (None, '') else None
        locality_id = int(locality_id) if locality_id not in (None, '') else None
        password_hash = hashlib.sha256(
            password.encode('utf-8')
        ).hexdigest() if password else None

        cursor.execute(
            """
            SELECT user_id
            FROM swm_users
            WHERE username = %s OR email = %s
            LIMIT 1
            """,
            (username, email)
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """
                UPDATE swm_users
                SET
                    username = %s,
                    full_name = %s,
                    email = %s,
                    password_hash = %s,
                    role = %s,
                    district_id = %s,
                    locality_id = %s,
                    status = 'Active',
                    last_sign_in = NOW()
                WHERE user_id = %s
                """,
                (
                    username,
                    full_name,
                    email,
                    password_hash,
                    role,
                    district_id,
                    locality_id,
                    existing['user_id'],
                )
            )
            user_id = existing['user_id']
        else:
            cursor.execute(
                """
                INSERT INTO swm_users
                (
                    username,
                    full_name,
                    email,
                    password_hash,
                    role,
                    district_id,
                    locality_id,
                    status,
                    last_sign_in
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'Active', NOW())
                """,
                (
                    username,
                    full_name,
                    email,
                    password_hash,
                    role,
                    district_id,
                    locality_id,
                )
            )
            user_id = cursor.lastrowid

        connection.commit()

        rows = _user_select(
            cursor,
            'u.user_id = %s',
            (user_id,)
        )

        if not rows:
            return {
                'status': 'ERROR',
                'message': 'Unable to load the signed-in user.'
            }

        return {
            'status': 'OK',
            'message': 'Login recorded successfully.',
            'data': _user_dict(rows[0])
        }

    except Exception as error:
        if connection and connection.is_connected():
            connection.rollback()

        return {
            'status': 'ERROR',
            'message': 'Failed to record login.',
            'error': str(error)
        }

    finally:
        if connection and connection.is_connected():
            connection.close()

@app.get('/api/users')
def users_list():
    c=None
    try:
        c=mysql.connector.connect(**DB_CONFIG); cur=c.cursor(dictionary=True); _ensure_users_table(cur); _seed_project_role_users(cur); _sync_collectors_as_workers(cur); c.commit(); rows=_user_select(cur); users=[_user_dict(r) for r in rows]
        return {'status':'OK','data':users,'summary':{'total_users':len(users),'administrators':sum(x['role']=='Administrator' for x in users),'municipal_workers':sum(x['role']=='Municipal Worker' for x in users),'locality_users':sum(x['role']=='Locality User' for x in users)}}
    except Exception as e: return {'status':'ERROR','message':'Failed to load users.','error':str(e)}
    finally:
        if c and c.is_connected(): c.close()

@app.post('/api/users')
def users_create(payload:dict):
    c=None
    try:
        username=str(payload.get('username') or '').strip(); name=str(payload.get('name') or payload.get('full_name') or '').strip(); email=str(payload.get('email') or '').strip(); role=str(payload.get('role') or '').strip()
        if not username or not name or not email or role not in ('Administrator','Municipal Worker','Locality User'): return {'status':'ERROR','message':'Username, name, email and a valid role are required.'}
        c=mysql.connector.connect(**DB_CONFIG); cur=c.cursor(dictionary=True); _ensure_users_table(cur); cur.execute('SELECT user_id FROM swm_users WHERE username=%s OR email=%s LIMIT 1',(username,email))
        if cur.fetchone(): return {'status':'ERROR','message':'Username or email already exists.'}
        cur.execute("INSERT INTO swm_users(username,full_name,email,password_hash,role,district_id,locality_id,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",(username,name,email,None,role,payload.get('district_id') or None,payload.get('locality_id') or None,payload.get('status') if payload.get('status') in ('Active','Inactive') else 'Active'))
        c.commit(); row=_user_select(cur,'u.user_id=%s',(cur.lastrowid,))[0]; return {'status':'OK','data':_user_dict(row)}
    except Exception as e:
        if c and c.is_connected(): c.rollback()
        return {'status':'ERROR','message':'Failed to create user.','error':str(e)}
    finally:
        if c and c.is_connected(): c.close()

@app.put('/api/users/{user_id}')
def users_update(user_id:int,payload:dict):
    c=None
    try:
        c=mysql.connector.connect(**DB_CONFIG); cur=c.cursor(dictionary=True); _ensure_users_table(cur); username=str(payload.get('username') or '').strip(); name=str(payload.get('name') or payload.get('full_name') or '').strip(); email=str(payload.get('email') or '').strip(); role=str(payload.get('role') or '').strip(); status=payload.get('status') if payload.get('status') in ('Active','Inactive') else 'Active'
        if role not in ('Administrator','Municipal Worker','Locality User') or not username or not name or not email: return {'status':'ERROR','message':'Invalid user details.'}
        cur.execute('SELECT user_id FROM swm_users WHERE (username=%s OR email=%s) AND user_id<>%s LIMIT 1',(username,email,user_id))
        if cur.fetchone(): return {'status':'ERROR','message':'Username or email already exists.'}
        cur.execute('UPDATE swm_users SET username=%s,full_name=%s,email=%s,role=%s,district_id=%s,locality_id=%s,status=%s WHERE user_id=%s',(username,name,email,role,payload.get('district_id') or None,payload.get('locality_id') or None,status,user_id)); c.commit(); rows=_user_select(cur,'u.user_id=%s',(user_id,))
        if not rows: return {'status':'ERROR','message':'User not found.'}
        return {'status':'OK','data':_user_dict(rows[0])}
    except Exception as e:
        if c and c.is_connected(): c.rollback()
        return {'status':'ERROR','message':'Failed to update user.','error':str(e)}
    finally:
        if c and c.is_connected(): c.close()

@app.patch('/api/users/{user_id}/status')
def users_status(user_id:int,payload:dict):
    c=None
    try:
        status=payload.get('status')
        if status not in ('Active','Inactive'): return {'status':'ERROR','message':'Invalid status.'}
        c=mysql.connector.connect(**DB_CONFIG); cur=c.cursor(); _ensure_users_table(cur); cur.execute('UPDATE swm_users SET status=%s WHERE user_id=%s',(status,user_id)); changed=cur.rowcount; c.commit(); return {'status':'OK'} if changed else {'status':'ERROR','message':'User not found.'}
    except Exception as e: return {'status':'ERROR','message':'Failed to update status.','error':str(e)}
    finally:
        if c and c.is_connected(): c.close()

@app.delete('/api/users/{user_id}')
def users_delete(user_id:int):
    c=None
    try:
        c=mysql.connector.connect(**DB_CONFIG); cur=c.cursor(); _ensure_users_table(cur); cur.execute('DELETE FROM swm_users WHERE user_id=%s',(user_id,)); changed=cur.rowcount; c.commit(); return {'status':'OK'} if changed else {'status':'ERROR','message':'User not found.'}
    except Exception as e: return {'status':'ERROR','message':'Failed to delete user.','error':str(e)}
    finally:
        if c and c.is_connected(): c.close()
