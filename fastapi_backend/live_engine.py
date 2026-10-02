from datetime import datetime
import random
import time


class LiveEngine:

    def __init__(self):
        self.states = {}

    # =========================================================
    # CURRENT SECOND
    # =========================================================

    def current_second(self):
        return datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

    # =========================================================
    # INITIALIZE STATE
    # =========================================================

    def initialize(
        self,
        key,
        locality_name="All locations",
        dispatch_pool=None
    ):

        if key in self.states:
            if dispatch_pool is not None:
                self.states[key]["dispatch_pool"] = dispatch_pool
                self.assign_request_workers(
                    self.states[key]
                )
            return

        # Dynamic starting number of runtime bins.
        # This is deliberately NOT fixed at 20.
        # The runtime fleet starts in a wider range so
        # different runs do not keep starting at the same count.
        total_bins = random.randint(
            15,
            22
        )

        bins = []

        for i in range(
            1,
            total_bins + 1
        ):

            level = random.randint(
                35,
                72
            )

            threshold = random.choice(
                [75, 78, 80, 82]
            )

            if level >= threshold:
                status = "Critical"

            elif level >= threshold - 20:
                status = "Warning"

            else:
                status = "Normal"

            bins.append({

                "bin_id":
                    f"SIM-{i:03d}",

                "bin_code":
                    f"BIN-{i:03d}",

                "location":
                    self.make_location(
                        locality_name,
                        i
                    ),

                "capacity":
                    random.choice(
                        [
                            120,
                            150,
                            180,
                            200,
                            240
                        ]
                    ),

                "level":
                    level,

                "threshold":
                    threshold,

                "status":
                    status,

                "online":
                    True
            })

        # Initial average of the generated bins.
        initial_average = round(
            sum(
                b["level"]
                for b in bins
            ) / len(bins)
        )

        self.states[key] = {

            "last_second":
                self.current_second(),

            # Shared 20-second snapshot timer.
            # Set in the past so the very first API request
            # generates the initial live snapshot immediately.
            "last_update_time":
                time.time() - 20,

            "bins":
                bins,

            "requests":
                self.create_requests(
                    bins,
                    locality_name
                ),

            "dispatch_pool":
                dispatch_pool or {
                    "collectors": [],
                    "vehicles": [],
                },

            "completed_today":
                random.randint(
                    1,
                    4
                ),

            "history": [],

            "collection_activity": [],

            "seconds_elapsed":
                0,

            # Used to create visible peaks and dips
            # in the real calculated average.
            "system_average":
                initial_average,

            # +1 = rising, -1 = falling
            "trend":
                random.choice(
                    [1, 1, 1, -1]
                ),

            # Number of API-update cycles before
            # the current direction changes.
            "trend_steps_left":
                random.randint(
                    2,
                    4
                ),
        }

    # =========================================================
    # LOCATIONS
    # =========================================================

    def make_location(
        self,
        locality_name,
        number
    ):

        locations = [

            f"Main road, {locality_name}",

            f"Market area, {locality_name}",

            f"Community area, {locality_name}",

            f"Residential area, {locality_name}",

            f"Bus stop, {locality_name}",

            f"School road, {locality_name}",

            f"Park area, {locality_name}",

            f"Commercial area, {locality_name}",
        ]

        return locations[
            (number - 1)
            % len(locations)
        ]

    # =========================================================
    # REQUEST CREATION
    # =========================================================

    def create_requests(
        self,
        bins,
        locality_name
    ):

        requests = []

        if not bins:
            return requests

        # =====================================================
        # REQUEST SELECTION
        #
        # Critical bins are guaranteed to receive a collection
        # request first. Warning bins are next, then Normal.
        #
        # This makes Critical bins available in Collections
        # instead of relying on random selection.
        # =====================================================

        critical_bins = [
            b for b in bins
            if b["status"] == "Critical"
        ]

        warning_bins = [
            b for b in bins
            if b["status"] == "Warning"
        ]

        normal_bins = [
            b for b in bins
            if b["status"] == "Normal"
        ]

        request_count = random.randint(
            4,
            min(
                7,
                len(bins)
            )
        )

        selected_bins = []

        # Always include Critical bins first.
        for bin_data in critical_bins:

            if len(selected_bins) >= request_count:
                break

            selected_bins.append(
                bin_data
            )

        # Then fill remaining slots with Warning bins.
        warning_pool = warning_bins[:]
        random.shuffle(warning_pool)

        for bin_data in warning_pool:

            if len(selected_bins) >= request_count:
                break

            selected_bins.append(
                bin_data
            )

        # Finally fill remaining slots with Normal bins.
        normal_pool = normal_bins[:]
        random.shuffle(normal_pool)

        for bin_data in normal_pool:

            if len(selected_bins) >= request_count:
                break

            selected_bins.append(
                bin_data
            )

        statuses = [
            "Pending",
            "Assigned",
            "In Progress",
        ]

        for index, bin_data in enumerate(
            selected_bins,
            start=1
        ):

            requests.append({

                "requestId":
                    (
                        f"REQ-SIM-"
                        f"{random.randint(100,999)}-"
                        f"{index:03d}"
                    ),

                "binCode":
                    bin_data["bin_code"],

                "location":
                    bin_data["location"],

                "priority":
                    self.priority_for_bin(
                        bin_data
                    ),

                # Critical requests begin as Pending so they
                # are visible and ready for allocation.
                "status":
                    (
                        "Pending"
                        if bin_data["status"] == "Critical"
                        else random.choice(statuses)
                    ),

                "requestedAt":
                    datetime.now().isoformat(),

                "binStatus":
                    bin_data["status"]
            })

        return requests

    # =========================================================
    # DISPATCH / ASSIGNMENT MAPPING
    #
    # Uses the existing MySQL collector + vehicle master
    # records supplied by main.py. No fake people or vehicles
    # are created here.
    # =========================================================

    def assign_request_workers(
        self,
        state
    ):

        pool = state.get(
            "dispatch_pool",
            {}
        ) or {}

        collectors = [
            dict(item)
            for item in pool.get(
                "collectors",
                []
            )
            if str(
                item.get(
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
            dict(item)
            for item in pool.get(
                "vehicles",
                []
            )
            if str(
                item.get(
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
            return

        # Pair collectors with their existing vehicles first.
        vehicles_by_collector = {}

        for vehicle in vehicles:
            collector_id = vehicle.get(
                "collector_id"
            )

            if collector_id is None:
                continue

            vehicles_by_collector.setdefault(
                collector_id,
                []
            ).append(
                vehicle
            )

        worker_pairs = []

        for collector in collectors:

            collector_id = collector.get(
                "collector_id"
            )

            assigned_vehicles = (
                vehicles_by_collector.get(
                    collector_id,
                    []
                )
            )

            vehicle = (
                assigned_vehicles[0]
                if assigned_vehicles
                else None
            )

            worker_pairs.append({
                "collector_id":
                    collector_id,

                "collector_name":
                    collector.get(
                        "collector_name",
                        "Unassigned"
                    ),

                "collector_status":
                    collector.get(
                        "status",
                        "Available"
                    ),

                "vehicle_id":
                    (
                        vehicle.get(
                            "vehicle_id"
                        )
                        if vehicle
                        else None
                    ),

                "vehicle_number":
                    (
                        vehicle.get(
                            "vehicle_number"
                        )
                        if vehicle
                        else None
                    ),

                "vehicle_status":
                    (
                        vehicle.get(
                            "status"
                        )
                        if vehicle
                        else None
                    ),
            })

        if not worker_pairs:
            return

        # Critical work is allocated first, then High, then Medium.
        priority_order = {
            "Critical": 3,
            "High": 2,
            "Medium": 1,
        }

        requests = state.get(
            "requests",
            []
        )

        loads = {
            pair["collector_id"]: 0
            for pair in worker_pairs
        }

        # Preserve valid assignments and count their current load.
        for request in requests:

            existing_collector = request.get(
                "collector_id"
            )

            if any(
                pair["collector_id"]
                == existing_collector
                for pair in worker_pairs
            ):
                if request.get("status") not in [
                    "Completed",
                    "Cancelled",
                ]:
                    loads[existing_collector] += 1

        ordered_requests = sorted(
            requests,
            key=lambda request: (
                priority_order.get(
                    request.get(
                        "priority",
                        "Medium"
                    ),
                    1
                ),
                1
                if request.get("status")
                in [
                    "Critical",
                    "Assigned",
                    "In Progress",
                ]
                else 0
            ),
            reverse=True
        )

        for request in ordered_requests:

            if request.get("status") == "Cancelled":
                continue

            current_collector_id = request.get(
                "collector_id"
            )

            current_pair = next(
                (
                    pair
                    for pair in worker_pairs
                    if pair["collector_id"]
                    == current_collector_id
                ),
                None
            )

            # Keep an already valid assignment.
            if current_pair is not None:
                request["collector_id"] = (
                    current_pair[
                        "collector_id"
                    ]
                )

                request["collector"] = (
                    current_pair[
                        "collector_name"
                    ]
                )

                request["collectorName"] = (
                    current_pair[
                        "collector_name"
                    ]
                )

                request["vehicle_id"] = (
                    current_pair[
                        "vehicle_id"
                    ]
                )

                request["vehicle"] = (
                    current_pair[
                        "vehicle_number"
                    ]
                    or "Unassigned"
                )

                request["vehicleNumber"] = (
                    current_pair[
                        "vehicle_number"
                    ]
                    or "Unassigned"
                )

                continue

            # Select the least-loaded usable worker so the
            # assignments stay balanced across the workforce.
            selected_pair = min(
                worker_pairs,
                key=lambda pair:
                    loads.get(
                        pair["collector_id"],
                        0
                    )
            )

            request["collector_id"] = (
                selected_pair[
                    "collector_id"
                ]
            )

            request["collector"] = (
                selected_pair[
                    "collector_name"
                ]
            )

            request["collectorName"] = (
                selected_pair[
                    "collector_name"
                ]
            )

            request["vehicle_id"] = (
                selected_pair[
                    "vehicle_id"
                ]
            )

            request["vehicle"] = (
                selected_pair[
                    "vehicle_number"
                ]
                or "Unassigned"
            )

            request["vehicleNumber"] = (
                selected_pair[
                    "vehicle_number"
                ]
                or "Unassigned"
            )

            if request.get(
                "status"
            ) in [
                "Assigned",
                "In Progress",
            ] and not request.get(
                "assignedAt"
            ):
                request["assignedAt"] = (
                    datetime.now().isoformat()
                )

            if request.get(
                "status"
            ) not in [
                "Completed",
                "Cancelled",
            ]:
                loads[
                    selected_pair[
                        "collector_id"
                    ]
                ] += 1

    # =========================================================
    # PRIORITY
    # =========================================================

    def priority_for_bin(
        self,
        bin_data
    ):

        if (
            bin_data["status"]
            == "Critical"
        ):
            return "Critical"

        if (
            bin_data["status"]
            == "Warning"
        ):
            return "High"

        return "Medium"

    # =========================================================
    # CHANGE THE OVERALL WASTE TREND
    # =========================================================

    def update_system_average(
        self,
        state
    ):

        # When a run ends, reverse the direction.
        if (
            state["trend_steps_left"]
            <= 0
        ):

            state["trend"] *= -1

            state["trend_steps_left"] = (
                random.randint(
                    2,
                    4
                )
            )

        # Large, visible movement.
        # Typical graph progression can look like:
        # 45 → 50 → 55 → 60 → 52 → 48 → 54
        if state["trend"] > 0:

            change = random.choice(
                [
                    4,
                    5,
                    5,
                    6,
                    7
                ]
            )

        else:

            change = -random.choice(
                [
                    4,
                    5,
                    5,
                    6,
                    7
                ]
            )

        state["system_average"] += change

        # Keep the overall graph realistic.
        # It can move well below and above 50%.
        if state["system_average"] < 35:

            state["system_average"] = 35

            state["trend"] = 1

            state["trend_steps_left"] = (
                random.randint(
                    2,
                    4
                )
            )

        elif state["system_average"] > 75:

            state["system_average"] = 75

            state["trend"] = -1

            state["trend_steps_left"] = (
                random.randint(
                    2,
                    4
                )
            )

        state["trend_steps_left"] -= 1

        return round(
            state["system_average"]
        )

    # =========================================================
    # UPDATE LIVE SYSTEM
    # =========================================================

    def update(
        self,
        key,
        locality_name="All locations",
        force=False
    ):

        self.initialize(
            key,
            locality_name
        )

        state = self.states[key]

        # =====================================================
        # SHARED 20-SECOND SNAPSHOT
        #
        # Overview, Monitoring and every other page that calls
        # this engine receive the SAME live state for 20 seconds.
        #
        # This prevents one page from showing different critical
        # bins or waste levels from another page.
        # =====================================================

        current_time = time.time()

        elapsed = (
            current_time
            - state["last_update_time"]
        )

        # Keep returning the exact same snapshot until
        # 20 seconds have passed.
        #
        # A manual Refresh can bypass this wait by
        # sending force=True.
        if (
            elapsed < 20
            and not force
        ):

            return state

        # Start one new shared snapshot.
        state["last_update_time"] = current_time

        state["last_second"] = (
            self.current_second()
        )

        # Each update represents 20 seconds of simulated
        # operational time.
        state["seconds_elapsed"] += 20

        # =====================================================
        # DYNAMIC BIN COUNT
        #
        # The number itself can move over time.
        # It is not fixed at 20.
        # =====================================================

        # Change the count on every 20-second live snapshot.
        # There is NEVER a zero-change option, so the
        # visible bin count moves over time.
        if (
            state["seconds_elapsed"] % 20
            == 0
        ):

            current_count = len(
                state["bins"]
            )

            # Always move by at least one bin.
            change = random.choice(
                [
                    -3,
                    -2,
                    -1,
                    1,
                    2,
                    3
                ]
            )

            new_count = (
                current_count
                + change
            )

            # Keep the runtime fleet within a
            # sensible dynamic range.
            new_count = max(
                10,
                min(
                    25,
                    new_count
                )
            )

            # If a boundary would prevent movement,
            # force the count in the opposite direction.
            if new_count == current_count:

                if current_count <= 10:
                    new_count = 11

                elif current_count >= 25:
                    new_count = 24

                else:
                    new_count = (
                        current_count + 1
                    )

            # Add bins
            while (
                len(state["bins"])
                < new_count
            ):

                number = (
                    len(state["bins"])
                    + 1
                )

                level = random.randint(
                    30,
                    65
                )

                threshold = random.choice(
                    [75, 78, 80, 82]
                )

                if level >= threshold:

                    status = "Critical"

                elif (
                    level >=
                    threshold - 20
                ):

                    status = "Warning"

                else:

                    status = "Normal"

                state["bins"].append({

                    "bin_id":
                        f"SIM-{number:03d}",

                    "bin_code":
                        f"BIN-{number:03d}",

                    "location":
                        self.make_location(
                            locality_name,
                            number
                        ),

                    "capacity":
                        random.choice(
                            [
                                120,
                                150,
                                180,
                                200,
                                240
                            ]
                        ),

                    "level":
                        level,

                    "threshold":
                        threshold,

                    "status":
                        status,

                    "online":
                        True
                })

            # Remove bins from the runtime fleet
            # when the current live count decreases.
            if (
                len(state["bins"])
                > new_count
            ):

                state["bins"] = (
                    state["bins"][
                        :new_count
                    ]
                )

        # =====================================================
        # UPDATE OVERALL SYSTEM TREND
        # =====================================================

        target_average = (
            self.update_system_average(
                state
            )
        )

        # =====================================================
        # MOVE EVERY BIN TOWARD THE NEW SYSTEM LEVEL
        #
        # This keeps the displayed average genuinely tied
        # to the bin values while still creating strong
        # peaks and dips.
        # =====================================================

        if state["bins"]:

            current_average = sum(
                b["level"]
                for b in state["bins"]
            ) / len(
                state["bins"]
            )

            # Main correction pushes the actual bin average
            # strongly toward the target average.
            correction = (
                target_average
                - current_average
            ) * 0.70

        else:

            correction = 0

        for bin_data in state["bins"]:

            old_level = float(
                bin_data["level"]
            )

            # Individual variation prevents every bin
            # from moving identically.
            individual_change = random.choice(
                [
                    -6,
                    -4,
                    -3,
                    -2,
                    -1,
                    0,
                    1,
                    2,
                    3,
                    4,
                    6
                ]
            )

            new_level = (
                old_level
                + correction
                + individual_change
            )

            # Keep bins within a sensible range.
            new_level = max(
                20,
                min(
                    98,
                    new_level
                )
            )

            # =================================================
            # COLLECTION EVENT
            # =================================================

            if (
                new_level
                >= bin_data["threshold"]
                and
                random.random() < 0.08
            ):

                # Collection drops the bin level sharply.
                new_level = random.randint(
                    28,
                    42
                )

                state[
                    "completed_today"
                ] += 1

            elif (
                old_level
                >= bin_data["threshold"]
                and
                random.random() < 0.05
            ):

                new_level = random.randint(
                    32,
                    46
                )

            bin_data["level"] = round(
                new_level
            )

            # =================================================
            # STATUS
            # =================================================

            if (
                bin_data["level"]
                >= bin_data["threshold"]
            ):

                bin_data["status"] = (
                    "Critical"
                )

            elif (
                bin_data["level"]
                >= (
                    bin_data["threshold"]
                    - 20
                )
            ):

                bin_data["status"] = (
                    "Warning"
                )

            else:

                bin_data["status"] = (
                    "Normal"
                )

            # =================================================
            # ONLINE / OFFLINE
            # =================================================

            if random.random() < 0.025:

                bin_data["online"] = False

            elif random.random() < 0.15:

                bin_data["online"] = True

        # =====================================================
        # UPDATE REQUESTS
        # =====================================================

        activity_value = (
            self.update_requests(
                state
            )
        )

        # =====================================================
        # CALCULATE ACTUAL AVERAGE FROM BINS
        # =====================================================

        if state["bins"]:

            average_level = round(

                sum(
                    b["level"]
                    for b in state["bins"]
                )
                /
                len(
                    state["bins"]
                )
            )

        else:

            average_level = (
                target_average
            )

        # =====================================================
        # WASTE HISTORY
        #
        # One new point per shared 20-second snapshot.
        # Overview and Monitoring receive the same history.
        # =====================================================

        state["history"].append({

            "time":
                datetime.now().strftime(
                    "%H:%M:%S"
                ),

            "average":
                average_level
        })

        state["history"] = (
            state["history"][-10:]
        )

        # =====================================================
        # COLLECTION ACTIVITY
        #
        # Varies with actual requests and events,
        # and is shared by all dashboard pages.
        # =====================================================

        state[
            "collection_activity"
        ].append({

            "label":
                datetime.now().strftime(
                    "%H:%M:%S"
                ),

            "total":
                activity_value
        })

        state[
            "collection_activity"
        ] = (
            state[
                "collection_activity"
            ][-10:]
        )

        return state

    def ensure_critical_requests(
        self,
        state
    ):

        requests = state["requests"]

        # =====================================================
        # GUARANTEE CRITICAL BINS HAVE ACTIVE REQUESTS
        #
        # If a bin becomes Critical and does not currently have
        # an active request, create one immediately.
        #
        # This is what makes Critical bins available in the
        # Collections module for allocation.
        # =====================================================

        for bin_data in state["bins"]:

            if bin_data["status"] != "Critical":
                continue

            has_active_request = any(

                request["binCode"]
                == bin_data["bin_code"]

                and request["status"]
                not in [
                    "Completed",
                    "Cancelled"
                ]

                for request in requests
            )

            if has_active_request:
                continue

            requests.insert(
                0,
                {
                    "requestId":
                        (
                            f"REQ-SIM-"
                            f"{random.randint(100,999)}-"
                            f"{random.randint(1,999):03d}"
                        ),

                    "binCode":
                        bin_data["bin_code"],

                    "location":
                        bin_data["location"],

                    "priority":
                        "Critical",

                    "status":
                        "Pending",

                    "requestedAt":
                        datetime.now().isoformat(),

                    "binStatus":
                        "Critical"
                }
            )

        return requests

    # =========================================================
    # REQUEST UPDATES
    # =========================================================

    def update_requests(
        self,
        state
    ):

        requests = (
            state["requests"]
        )

        # Critical bins must always be represented in the
        # collection board when they need service.
        requests = self.ensure_critical_requests(
            state
        )

        activity = 0

        # =====================================================
        # SYNCHRONIZE REQUESTS WITH BIN STATUS
        # =====================================================

        for request in requests:

            matching_bin = next(

                (
                    b
                    for b in state["bins"]

                    if (
                        b["bin_code"]
                        ==
                        request["binCode"]
                    )
                ),

                None
            )

            if matching_bin:

                request["binStatus"] = (
                    matching_bin["status"]
                )

                request["priority"] = (
                    self.priority_for_bin(
                        matching_bin
                    )
                )

        # =====================================================
        # REQUEST STATUS PROGRESSION
        # =====================================================

        for request in requests:

            if random.random() < 0.08:

                if (
                    request["status"]
                    == "Pending"
                ):

                    request["status"] = (
                        "Assigned"
                    )

                    activity += 1

                elif (
                    request["status"]
                    == "Assigned"
                ):

                    request["status"] = (
                        "In Progress"
                    )

                    activity += 1

                elif (
                    request["status"]
                    == "In Progress"
                ):

                    request["status"] = (
                        "Completed"
                    )

                    state[
                        "completed_today"
                    ] += 1

                    activity += 2

        # =====================================================
        # ACTIVE REQUESTS ADD TO ACTIVITY
        # =====================================================

        active_count = sum(

            1

            for request
            in requests

            if request["status"]
            not in [
                "Completed",
                "Cancelled"
            ]
        )

        activity += min(
            active_count,
            5
        )

        # =====================================================
        # POSSIBLY CREATE A NEW REQUEST
        # =====================================================

        actionable_bins = [

            b

            for b
            in state["bins"]

            if (
                b["status"]
                in [
                    "Warning",
                    "Critical"
                ]
            )
        ]

        if (
            actionable_bins
            and
            random.random() < 0.12
        ):

            candidate = random.choice(
                actionable_bins
            )

            existing = any(

                r["binCode"]
                ==
                candidate["bin_code"]

                and
                r["status"]
                not in [
                    "Completed",
                    "Cancelled"
                ]

                for r in requests
            )

            if not existing:

                requests.insert(

                    0,

                    {

                        "requestId":
                            (
                                f"REQ-SIM-"
                                f"{random.randint(100,999)}-"
                                f"{random.randint(1,999):03d}"
                            ),

                        "binCode":
                            candidate["bin_code"],

                        "location":
                            candidate["location"],

                        "priority":
                            self.priority_for_bin(
                                candidate
                            ),

                        "status":
                            "Pending",

                        "requestedAt":
                            datetime.now().isoformat(),

                        "binStatus":
                            candidate["status"]
                    }
                )

                activity += 1

        # =====================================================
        # GIVE ACTIVITY SOME NATURAL VARIATION
        #
        # Keeps the bar chart from being flat at one value.
        # =====================================================

        activity += random.choice(
            [
                0,
                0,
                1,
                1,
                2
            ]
        )

        # =====================================================
        # KEEP CRITICAL REQUESTS VISIBLE
        #
        # Critical active requests are kept at the top, followed
        # by Warning/High and then Normal/Medium requests.
        # This prevents critical bins from disappearing just
        # because the runtime request list reached its 8-row cap.
        # =====================================================

        priority_order = {
            "Critical": 3,
            "High": 2,
            "Medium": 1
        }

        status_order = {
            "Pending": 3,
            "Assigned": 2,
            "In Progress": 1,
            "Completed": 0,
            "Cancelled": 0
        }

        requests.sort(
            key=lambda request: (
                priority_order.get(
                    request.get("priority"),
                    1
                ),
                status_order.get(
                    request.get("status"),
                    0
                )
            ),
            reverse=True
        )

        state["requests"] = requests[:8]

        # Keep Collections, Collectors and Vehicles aligned
        # with the same central runtime assignment state.
        self.assign_request_workers(
            state
        )

        # Keep chart values in a clean range.
        return min(
            10,
            max(
                1,
                activity
            )
        )


# =========================================================
# CENTRAL LIVE ENGINE
# =========================================================

live_engine = LiveEngine()
