import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";

import {
  Link,
  useOutletContext,
} from "react-router-dom";

import "../styles/Monitoring.css";


const API_BASE_URL =
  "http://localhost:8000";


/* =========================================================
   MONITORING
========================================================= */

function Monitoring() {

  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();


  /* =======================================================
     STATE
  ======================================================= */

  const [bins, setBins] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState("");

  const [filter, setFilter] =
    useState("All");


  /* =======================================================
     LOAD LIVE BINS
  ======================================================= */

  const loadMonitoring =
    useCallback(
      async (forceRefresh = false) => {

        if (!districtId) {

          setBins([]);

          setLoading(false);

          return;
        }


        try {

          setError("");


          const params =
            new URLSearchParams();

          params.set(
            "district_id",
            String(districtId)
          );


          if (forceRefresh) {

            params.set(
              "force",
              "true"
            );

          }


          if (localityId) {

            params.set(
              "locality_id",
              String(localityId)
            );
          }


          const response =
            await fetch(
              `${API_BASE_URL}/api/overview-live?${params.toString()}`,
              {
                cache: "no-store",
              }
            );


          if (!response.ok) {

            throw new Error(
              `FastAPI returned ${response.status}`
            );
          }


          const result =
            await response.json();


          if (
            result.status !== "OK"
          ) {

            throw new Error(
              result.message ||
              "Unable to load monitoring data"
            );
          }


          setBins(
            Array.isArray(
              result.liveBins
            )
              ? result.liveBins
              : []
          );


          setLastUpdated(
            result.simulation_second ||
            result.updated_at ||
            ""
          );

        } catch (err) {

          console.error(
            "Monitoring error:",
            err
          );

          setError(
            "Unable to load live monitoring data."
          );

        } finally {

          setLoading(false);
        }

      },
      [
        districtId,
        localityId,
      ]
    );


  /* =======================================================
     INITIAL LOAD + EVERY 20 SECONDS
  ======================================================= */

  useEffect(() => {

    loadMonitoring();


    const intervalId =
      setInterval(
        loadMonitoring,
        20000
      );


    return () =>
      clearInterval(
        intervalId
      );

  }, [
    loadMonitoring,
  ]);


  /* =======================================================
     COUNTS
  ======================================================= */

  const counts =
    useMemo(() => {

      return {

        normal:
          bins.filter(
            (bin) =>
              bin.status === "Normal"
          ).length,

        warning:
          bins.filter(
            (bin) =>
              bin.status === "Warning"
          ).length,

        critical:
          bins.filter(
            (bin) =>
              bin.status === "Critical"
          ).length,

      };

    }, [
      bins,
    ]);


  /* =======================================================
     FILTERED / SORTED BINS
  ======================================================= */

  const filteredBins =
    useMemo(() => {

      let result =
        [...bins];


      if (
        filter !== "All"
      ) {

        result =
          result.filter(
            (bin) =>
              bin.status === filter
          );
      }


      return result.sort(
        (
          a,
          b
        ) =>
          Number(
            b.waste_level || 0
          )
          -
          Number(
            a.waste_level || 0
          )
      );

    }, [
      bins,
      filter,
    ]);


  /* =======================================================
     MAP POSITION
  ======================================================= */

  const getPosition =
    (
      index,
      total
    ) => {

      const positions = [

        [14, 72],
        [20, 32],
        [32, 52],
        [46, 22],
        [52, 68],
        [66, 42],
        [73, 74],
        [82, 27],
        [87, 60],
        [38, 82],
        [58, 34],
        [76, 50],
        [26, 86],
        [62, 84],
        [91, 38],
        [43, 45],
        [15, 50],
        [71, 18],
        [35, 68],
        [82, 82],
        [54, 15],
        [95, 72],
        [9, 25],
        [68, 58],
        [48, 90],
      ];


      if (
        index <
        positions.length
      ) {

        return positions[index];
      }


      const angle =
        (
          index * 137.5
        ) *
        Math.PI /
        180;


      const radius =
        20 +
        (
          index % 4
        ) * 13;


      return [

        Math.max(
          5,
          Math.min(
            95,
            50 +
            Math.cos(angle)
            * radius
          )
        ),

        Math.max(
          8,
          Math.min(
            92,
            50 +
            Math.sin(angle)
            * radius
          )
        ),

      ];

    };


  /* =======================================================
     STATUS CLASS
  ======================================================= */

  const statusClass =
    (status) => {

      const value =
        String(
          status || "Normal"
        ).toLowerCase();


      if (
        value === "critical"
      ) {

        return "critical";
      }


      if (
        value === "warning"
      ) {

        return "warning";
      }


      return "normal";
    };


  /* =======================================================
     LOCATION
  ======================================================= */

  const locationText =
    localityName ||
    districtName ||
    "All locations";


  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <div className="monitoring-page">


      {/* =================================================
          HEADER
      ================================================= */}

      <div className="monitoring-header">

        <div>

          <div className="monitoring-eyebrow">

            CONTROL ROOM

          </div>


          <h1>

            Live Monitoring

          </h1>


          <p>

            Monitor the current waste level
            and status of registered bins.

          </p>

        </div>


        <div className="monitoring-header-actions">

          <div className="monitoring-live-indicator">

            <span className="live-dot" />

            LIVE

          </div>


          <button
            className="monitoring-refresh"
            type="button"
            onClick={() =>
              loadMonitoring(true)
            }
            disabled={
              loading
            }
          >

            <RefreshCw
              size={16}
            />

            {loading
              ? "Refreshing..."
              : "Refresh data"}

          </button>

        </div>

      </div>


      {/* =================================================
          ERROR
      ================================================= */}

      {error && (

        <div className="monitoring-error">

          {error}

        </div>

      )}


      {/* =================================================
          MAIN CONTROL ROOM
      ================================================= */}

      <div className="monitoring-control-room">


        {/* =================================================
            MAP
        ================================================= */}

        <section className="monitoring-map-card">


          <div className="monitoring-map-header">

            <div>

              <div className="monitoring-map-title">

                <MapPin
                  size={16}
                />

                City Bin Locations

              </div>


              <span>

                {locationText}

              </span>

            </div>


            <div className="monitoring-bin-count">

              {bins.length}

              {" "}

              bins

            </div>

          </div>


          <div className="monitoring-map">


            {/* Decorative city roads */}

            <div className="city-road road-1" />
            <div className="city-road road-2" />
            <div className="city-road road-3" />
            <div className="city-road road-4" />
            <div className="city-road road-5" />
            <div className="city-road road-6" />


            <div className="city-block block-1" />
            <div className="city-block block-2" />
            <div className="city-block block-3" />
            <div className="city-block block-4" />
            <div className="city-block block-5" />
            <div className="city-block block-6" />


            {/* Dynamic bin markers */}

            {bins.map(
              (
                bin,
                index
              ) => {

                const [
                  left,
                  top
                ] =
                  getPosition(
                    index,
                    bins.length
                  );


                const level =
                  Number(
                    bin.waste_level ||
                    0
                  );


                return (

                  <div
                    className={
                      `map-bin-marker ${statusClass(
                        bin.status
                      )}`
                    }
                    key={
                      bin.bin_id
                    }
                    style={{
                      left:
                        `${left}%`,
                      top:
                        `${top}%`,
                    }}
                    title={
                      `${bin.bin_code} · ${level}%`
                    }
                  >

                    <div className="map-bin-pulse" />

                    <div className="map-bin-icon">

                      <Truck
                        size={14}
                      />

                    </div>


                    <div className="map-bin-level">

                      {level}%

                    </div>

                  </div>

                );

              }
            )}


            {/* Empty map */}

            {!loading &&
              bins.length === 0 && (

              <div className="monitoring-map-empty">

                <Package
                  size={32}
                />

                <strong>

                  No live bins available

                </strong>

                <span>

                  Waiting for FastAPI runtime data.

                </span>

              </div>

            )}


            {/* Legend */}

            <div className="monitoring-legend">

              <strong>

                Status Legend

              </strong>


              <div>

                <span className="legend-dot normal" />

                Normal
                {" "}
                (&lt;55%)

              </div>


              <div>

                <span className="legend-dot warning" />

                Warning
                {" "}
                (55–79%)

              </div>


              <div>

                <span className="legend-dot critical" />

                Critical
                {" "}
                (≥80%)

              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            BIN STATUS LIST
        ================================================= */}

        <section className="monitoring-list-card">


          <div className="monitoring-list-header">

            <div>

              <h2>

                <Activity
                  size={17}
                />

                Bin Status List

              </h2>


              <p>

                Sorted by fill level
                (highest first)

              </p>

            </div>


            <select
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target.value
                )
              }
              className="monitoring-filter"
            >

              <option value="All">
                All statuses
              </option>

              <option value="Critical">
                Critical
              </option>

              <option value="Warning">
                Warning
              </option>

              <option value="Normal">
                Normal
              </option>

            </select>

          </div>


          {/* Summary strip */}

          <div className="monitoring-mini-summary">

            <div>

              <span className="summary-dot normal" />

              <strong>
                {counts.normal}
              </strong>

              <small>
                Normal
              </small>

            </div>


            <div>

              <span className="summary-dot warning" />

              <strong>
                {counts.warning}
              </strong>

              <small>
                Warning
              </small>

            </div>


            <div>

              <span className="summary-dot critical" />

              <strong>
                {counts.critical}
              </strong>

              <small>
                Critical
              </small>

            </div>

          </div>


          <div className="monitoring-bin-list">


            {loading ? (

              <div className="monitoring-list-loading">

                Loading live bins...

              </div>

            ) : filteredBins.length === 0 ? (

              <div className="monitoring-list-loading">

                No bins match this status.

              </div>

            ) : (

              filteredBins.map(
                (
                  bin
                ) => {

                  const level =
                    Number(
                      bin.waste_level ||
                      0
                    );


                  const percentage =
                    Math.min(
                      100,
                      Math.max(
                        0,
                        level
                      )
                    );


                  return (

                    <article
                      className={
                        `monitoring-bin-item ${statusClass(
                          bin.status
                        )}`
                      }
                      key={
                        bin.bin_id
                      }
                    >

                      <div className="monitoring-bin-top">

                        <div>

                          <strong>

                            {bin.bin_code}

                          </strong>


                          <span>

                            {bin.location}

                          </span>

                        </div>


                        <span
                          className={
                            `monitoring-status-badge ${statusClass(
                              bin.status
                            )}`
                          }
                        >

                          {bin.status}

                        </span>

                      </div>


                      <div className="monitoring-bin-level-row">

                        <strong>

                          {level}%

                        </strong>


                        <span>

                          of capacity

                        </span>

                      </div>


                      <div className="monitoring-progress">

                        <div
                          className={
                            `monitoring-progress-fill ${statusClass(
                              bin.status
                            )}`
                          }
                          style={{
                            width:
                              `${percentage}%`,
                          }}
                        />

                      </div>


                      <div className="monitoring-bin-bottom">

                        <span>

                          Last updated:
                          {" "}
                          {lastUpdated || "live"}

                        </span>


                        {(
                          bin.status ===
                            "Warning"
                          ||
                          bin.status ===
                            "Critical"
                        ) ? (

                          <Link
                            to="/dashboard/collections"
                            className="collect-now-button"
                          >

                            <Truck
                              size={13}
                            />

                            Collect Now

                          </Link>

                        ) : (

                          <span className="normal-indicator">

                            <CheckCircle2
                              size={14}
                            />

                            Operating normally

                          </span>

                        )}

                      </div>

                    </article>

                  );

                }
              )

            )}

          </div>

        </section>

      </div>


      {/* =================================================
          FOOTER
      ================================================= */}

      <div className="monitoring-footer">

        <Activity
          size={14}
        />

        Live monitoring · FastAPI runtime data ·
        Refreshes every 20 seconds

      </div>

    </div>
  );
}


export default Monitoring;