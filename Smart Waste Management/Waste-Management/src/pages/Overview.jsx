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
  ChevronRight,
  ClipboardList,
  Package,
  Plus,
  RefreshCw,
} from "lucide-react";

import {
  Link,
  useOutletContext,
} from "react-router-dom";

import "../styles/Overview.css";


const API_BASE_URL = "http://localhost:8000";


/* =========================================================
   EMPTY OVERVIEW
========================================================= */

const EMPTY_OVERVIEW = {
  summary: {
    totalBins: 0,
    onlineBins: 0,
    criticalBins: 0,
    warningBins: 0,
    normalBins: 0,
    requiresCollection: 0,
    openRequests: 0,
    completedToday: 0,
  },

  binDistribution: [],
  wasteLevels: [],
  wasteHistory: [],
  criticalAlerts: [],
  collectionActivity: [],
  recentRequests: [],
};


/* =========================================================
   TIME HELPERS
========================================================= */

function formatTime(value) {

  if (!value) {
    return "—";
  }

  const text = String(value);

  /* FastAPI may return HH:MM:SS */
  if (
    /^\d{2}:\d{2}:\d{2}$/.test(text)
  ) {
    return text;
  }

  /* FastAPI may return ISO datetime */
  const date = new Date(value);

  if (
    !Number.isNaN(date.getTime())
  ) {
    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    );
  }

  return text;
}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


/* =========================================================
   OVERVIEW
========================================================= */

function Overview() {

  const {
    loggedInUser,
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();


  /* =======================================================
     STATE
  ======================================================= */

  const [overviewData, setOverviewData] =
    useState(EMPTY_OVERVIEW);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState("");

  const [clock, setClock] =
    useState(new Date());


  /* =======================================================
     LIVE CLOCK
  ======================================================= */

  useEffect(() => {

    const clockId =
      setInterval(
        () => {
          setClock(new Date());
        },
        1000
      );

    return () =>
      clearInterval(clockId);

  }, []);


  /* =======================================================
     LOAD FASTAPI LIVE DATA
  ======================================================= */

  const loadOverview = useCallback(
    async (forceRefresh = false) => {

      if (!districtId) {

        setOverviewData(
          EMPTY_OVERVIEW
        );

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
              "FastAPI could not load live data"
          );
        }


        /* -------------------------------------------------
           CLEAN SUMMARY
        ------------------------------------------------- */

        const summary = {

          totalBins:
            Number(
              result.summary?.totalBins
            ) || 0,

          onlineBins:
            Number(
              result.summary?.onlineBins
            ) || 0,

          criticalBins:
            Number(
              result.summary?.criticalBins
            ) || 0,

          warningBins:
            Number(
              result.summary?.warningBins
            ) || 0,

          normalBins:
            Number(
              result.summary?.normalBins
            ) || 0,

          requiresCollection:
            Number(
              result.summary?.requiresCollection
            ) || 0,

          openRequests:
            Number(
              result.summary?.openRequests
            ) || 0,

          completedToday:
            Number(
              result.summary?.completedToday
            ) || 0,
        };


        /* -------------------------------------------------
           COMPLETE LIVE DATA
        ------------------------------------------------- */

        const cleanData = {

          summary,

          binDistribution:
            Array.isArray(
              result.binDistribution
            )
              ? result.binDistribution
              : [],

          wasteLevels:
            Array.isArray(
              result.wasteLevels
            )
              ? result.wasteLevels
              : [],

          wasteHistory:
            Array.isArray(
              result.wasteHistory
            )
              ? result.wasteHistory
              : [],

          criticalAlerts:
            Array.isArray(
              result.criticalAlerts
            )
              ? result.criticalAlerts
              : [],

          collectionActivity:
            Array.isArray(
              result.collectionActivity
            )
              ? result.collectionActivity
              : [],

          recentRequests:
            Array.isArray(
              result.recentRequests
            )
              ? result.recentRequests
              : [],
        };


        setOverviewData(
          cleanData
        );


        setLastUpdated(
          result.simulation_second ||
          result.updated_at ||
          new Date().toLocaleTimeString(
            "en-IN"
          )
        );

      } catch (err) {

        console.error(
          "FastAPI live overview error:",
          err
        );

        setError(
          "Unable to load live data from FastAPI."
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
     INITIAL LOAD + EVERY SECOND
  ======================================================= */

  useEffect(() => {

    loadOverview();


    const intervalId =
      setInterval(
        loadOverview,
        20000
      );


    return () =>
      clearInterval(
        intervalId
      );

  }, [
    loadOverview,
  ]);


  /* =======================================================
     LOCATION
  ======================================================= */

  const selectedLocation =
    localityName ||
    districtName ||
    "All locations";


  /* =======================================================
     HEADER DATE/TIME
  ======================================================= */

  const headerDate =
    clock.toLocaleDateString(
      "en-IN",
      {
        weekday: "long",
        day: "2-digit",
        month: "short",
      }
    ).toUpperCase();


  const headerTime =
    clock.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );


  /* =======================================================
     STAT CARDS
  ======================================================= */

  const stats = [

    {
      label:
        "BINS ONLINE",

      value:
        loading
          ? "—"
          : `${overviewData.summary.onlineBins}/${overviewData.summary.totalBins}`,

      note:
        "All locations reporting",

      icon:
        Package,

      type:
        "green",
    },


    {
      label:
        "REQUIRES COLLECTION",

      value:
        loading
          ? "—"
          : overviewData
              .summary
              .requiresCollection,

      note:
        `${overviewData.summary.warningBins} warning · ${overviewData.summary.criticalBins} critical`,

      icon:
        AlertTriangle,

      type:
        "yellow",
    },


    {
      label:
        "OPEN REQUESTS",

      value:
        loading
          ? "—"
          : overviewData
              .summary
              .openRequests,

      note:
        "All locations collection board",

      icon:
        ClipboardList,

      type:
        "teal",
    },


    {
      label:
        "COMPLETED TODAY",

      value:
        loading
          ? "—"
          : overviewData
              .summary
              .completedToday,

      note:
        "Updates as requests close",

      icon:
        CheckCircle2,

      type:
        "green",
    },
  ];


  /* =======================================================
     BIN DISTRIBUTION
  ======================================================= */

  const distribution =
    useMemo(() => {

      let normal = 0;
      let warning = 0;
      let critical = 0;


      overviewData
        .binDistribution
        .forEach(
          (item) => {

            const status =
              String(
                item.status || ""
              ).toLowerCase();


            const total =
              Number(
                item.total || 0
              );


            if (
              status === "critical"
            ) {

              critical += total;

            } else if (
              status === "warning" ||
              status === "near full" ||
              status === "high"
            ) {

              warning += total;

            } else {

              normal += total;
            }
          }
        );


      return {

        normal,
        warning,
        critical,

        total:
          normal +
          warning +
          critical,
      };

    }, [
      overviewData
        .binDistribution,
    ]);


  /* =======================================================
     DONUT
  ======================================================= */

  const donutStyle =
    useMemo(() => {

      if (
        distribution.total <= 0
      ) {

        return {
          background:
            "#eaf2ee",
        };
      }


      const normalEnd =
        (
          distribution.normal /
          distribution.total
        ) * 100;


      const warningEnd =
        normalEnd +
        (
          distribution.warning /
          distribution.total
        ) * 100;


      return {

        background:
          `conic-gradient(
            #2b8c83 0 ${normalEnd}%,
            #f7b733 ${normalEnd}% ${warningEnd}%,
            #ef3f3f ${warningEnd}% 100%
          )`,
      };

    }, [
      distribution,
    ]);


  /* =======================================================
     WASTE HISTORY
     
     IMPORTANT:
     FastAPI supplies the real runtime history.
     No artificial T-6/T-5/T-4 values here.
  ======================================================= */

  const graphData =
    useMemo(() => {

      const history =
        Array.isArray(
          overviewData.wasteHistory
        )
          ? overviewData.wasteHistory
          : [];


      const points =
        history
          .slice(-7)
          .map(
            (item) => ({

              time:
                item.time ||
                item.date ||
                "—",

              average:
                Math.max(
                  0,
                  Math.min(
                    100,
                    Number(
                      item.average ??
                      item.averageLevel ??
                      0
                    )
                  )
                ),
            })
          );


      /* Current average from current bins */
      if (
        points.length === 0 &&
        overviewData.wasteLevels.length > 0
      ) {

        const average =
          Math.round(

            overviewData
              .wasteLevels
              .reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  Number(
                    item.level || 0
                  ),
                0
              )
              /
              overviewData
                .wasteLevels.length
          );


        points.push({

          time:
            lastUpdated ||
            "Now",

          average:
            average,
        });
      }


      return points;

    }, [
      overviewData.wasteHistory,
      overviewData.wasteLevels,
      lastUpdated,
    ]);


  /* =======================================================
     GRAPH POINTS
  ======================================================= */

  const historyPoints =
    useMemo(() => {

      if (
        graphData.length === 0
      ) {

        return [];
      }


      return graphData.map(
        (
          item,
          index
        ) => {

          const x =
            graphData.length === 1
              ? 350
              : (
                  index /
                  (
                    graphData.length - 1
                  )
                ) * 700;


          const y =
            250 -
            (
              item.average /
              100
            ) * 210;


          return {

            x,
            y,

            value:
              item.average,

            time:
              item.time,
          };
        }
      );

    }, [
      graphData,
    ]);


  const wastePolyline =
    historyPoints
      .map(
        (point) =>
          `${point.x},${point.y}`
      )
      .join(" ");


  const wasteAreaPolygon =
    historyPoints.length >= 2
      ? `${wastePolyline} 700,250 0,250`
      : "";


  /* =======================================================
     COLLECTION ACTIVITY
  ======================================================= */

  const collectionActivity =
    useMemo(() => {

      return (
        overviewData
          .collectionActivity
          .slice(-7)
          .map(
            (
              item,
              index
            ) => ({

              key:
                `${item.label}-${index}`,

              label:
                item.label || "—",

              value:
                Number(
                  item.total || 0
                ),
            })
          )
      );

    }, [
      overviewData
        .collectionActivity,
    ]);


  const activityMax =
    Math.max(
      5,

      ...collectionActivity.map(
        (item) =>
          item.value
      )
    );


  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <div className="overview-page">


      {/* =================================================
          HEADER
      ================================================== */}

      <div className="overview-top">

        <div>

          <div className="overview-date">

            {headerDate}

            {" · "}

            {headerTime}

          </div>


          <h1>

            Good morning{" "}

            {
              loggedInUser?.username ||
              "User"
            }.

          </h1>


          <p>

            Current overview for{" "}

            {selectedLocation}.

          </p>

        </div>


        <div className="overview-actions">

          <button
            className="outline-button"
            type="button"
            onClick={() =>
              loadOverview(true)
            }
            disabled={
              loading
            }
          >

            <RefreshCw
              size={17}
            />

            {loading
              ? "Refreshing..."
              : "Refresh data"}

          </button>


          <Link
            className="primary-button"
            to="/dashboard/collections"
          >

            <Plus
              size={18}
            />

            New request

          </Link>

        </div>

      </div>


      {/* =================================================
          LIVE STATUS
      ================================================== */}

      <div className="overview-live-status">

        <Activity
          size={14}
        />

        <span>

          Live operational data · updates every 20 seconds

        </span>


        {lastUpdated && (

          <span>

            · Last update{" "}

            {formatTime(
              lastUpdated
            )}

          </span>

        )}

      </div>


      {/* =================================================
          ERROR
      ================================================== */}

      {error && (

        <div className="overview-error">

          {error}

        </div>

      )}


      {/* =================================================
          STAT CARDS
      ================================================== */}

      <section className="overview-stats">

        {stats.map(
          (
            item
          ) => {

            const Icon =
              item.icon;


            return (

              <div
                className="overview-stat-card"
                key={
                  item.label
                }
              >

                <div className="overview-stat-header">

                  <span>

                    {item.label}

                  </span>


                  <div
                    className={
                      `overview-stat-icon ${item.type}`
                    }
                  >

                    <Icon
                      size={19}
                    />

                  </div>

                </div>


                <h2>

                  {item.value}

                </h2>


                <p>

                  {item.note}

                </p>

              </div>

            );
          }
        )}

      </section>


      {/* =================================================
          WASTE LEVELS + BIN DISTRIBUTION
      ================================================== */}

      <section className="overview-two-column">


        {/* =================================================
            WASTE LEVELS
        ================================================== */}

        <div className="overview-panel large-panel">

          <div className="panel-header">

            <div>

              <h3>

                Waste levels · All locations

              </h3>

              <p>

                Average fill level across the selected scope

              </p>

            </div>


            <span className="panel-label">

              AVERAGE FILL %

            </span>

          </div>


          <div className="line-chart">

            <div className="chart-grid">

              <span>
                100
              </span>

              <span>
                75
              </span>

              <span>
                50
              </span>

              <span>
                25
              </span>

              <span>
                0
              </span>

            </div>


            <div className="chart-area">

              {historyPoints.length >= 2 ? (

                <svg
                  viewBox="0 0 700 250"
                  preserveAspectRatio="none"
                  className="overview-line-svg"
                >

                  <defs>

                    <linearGradient
                      id="overviewArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >

                      <stop
                        offset="0%"
                        stopColor="#2b8c83"
                        stopOpacity="0.20"
                      />

                      <stop
                        offset="100%"
                        stopColor="#2b8c83"
                        stopOpacity="0"
                      />

                    </linearGradient>

                  </defs>


                  <polygon
                    points={
                      wasteAreaPolygon
                    }
                    fill="url(#overviewArea)"
                  />


                  <polyline
                    points={
                      wastePolyline
                    }
                    fill="none"
                    stroke="#2b8c83"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />


                  {historyPoints.map(
                    (
                      point,
                      index
                    ) => (

                      <circle
                        key={
                          `${point.time}-${index}`
                        }
                        cx={
                          point.x
                        }
                        cy={
                          point.y
                        }
                        r="5"
                        fill="#ffffff"
                        stroke="#2b8c83"
                        strokeWidth="3"
                      />

                    )
                  )}

                </svg>

              ) : (

                <div className="overview-empty-chart">

                  Collecting live readings...

                </div>

              )}


              <div className="chart-days">

                {graphData.map(
                  (
                    item,
                    index
                  ) => (

                    <span
                      key={
                        `${item.time}-${index}`
                      }
                    >

                      {
                        formatTime(
                          item.time
                        )
                      }

                    </span>

                  )
                )}

              </div>

            </div>

          </div>

        </div>


        {/* =================================================
            BIN DISTRIBUTION
        ================================================== */}

        <div className="overview-panel distribution-panel">

          <div className="panel-header">

            <h3>

              Bin distribution

            </h3>

          </div>


          <div className="distribution-content">

            <div
              className="donut-chart"
              style={
                donutStyle
              }
            >

              <div className="donut-hole">

                <strong>

                  {
                    distribution.total
                  }

                </strong>

                <span>

                  Bins

                </span>

              </div>

            </div>


            <div className="distribution-legend">

              <div className="legend-row">

                <span className="legend-dot normal"></span>

                <span>
                  Normal
                </span>

                <strong>
                  {
                    distribution.normal
                  }
                </strong>

              </div>


              <div className="legend-row">

                <span className="legend-dot near-full"></span>

                <span>
                  Near full
                </span>

                <strong>
                  {
                    distribution.warning
                  }
                </strong>

              </div>


              <div className="legend-row">

                <span className="legend-dot critical"></span>

                <span>
                  Critical
                </span>

                <strong>
                  {
                    distribution.critical
                  }
                </strong>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* =================================================
          CRITICAL ALERTS + COLLECTION ACTIVITY
      ================================================== */}

      <section className="overview-two-column">


        {/* =================================================
            CRITICAL ALERTS
        ================================================== */}

        <div className="overview-panel">

          <div className="panel-header">

            <h3>

              Critical alerts

            </h3>


            <Link
              className="text-link"
              to="/dashboard/monitoring"
            >

              View monitoring

              <ChevronRight
                size={15}
              />

            </Link>

          </div>


          <div className="alert-list">

            {overviewData
              .criticalAlerts
              .length > 0 ? (

              overviewData
                .criticalAlerts
                .slice(0, 5)
                .map(
                  (
                    item,
                    index
                  ) => {

                    const level =
                      Math.min(
                        100,
                        Math.max(
                          0,
                          Number(
                            item.level ||
                              0
                          )
                        )
                      );


                    return (

                      <div
                        className="alert-row"
                        key={
                          `${item.binCode}-${index}`
                        }
                      >

                        <div className="alert-left">

                          <div className="alert-icon">

                            <AlertTriangle
                              size={16}
                            />

                          </div>


                          <div>

                            <strong>

                              {
                                item.location ||
                                item.binCode
                              }

                            </strong>


                            <span>

                              {
                                item.binCode
                              }

                              {" · "}

                              Critical reading

                            </span>

                          </div>

                        </div>


                        <div className="alert-right">

                          <div className="alert-progress">

                            <div
                              style={{
                                width:
                                  `${level}%`,
                              }}
                            />

                          </div>


                          <strong className="alert-value">

                            {level}%

                          </strong>


                          <ChevronRight
                            size={17}
                          />

                        </div>

                      </div>

                    );

                  }
                )

            ) : (

              <div className="overview-empty-state">

                <div className="alert-icon">

                  <CheckCircle2
                    size={20}
                  />

                </div>

                <strong>

                  No critical alerts

                </strong>

                <span>

                  Every bin is currently below the critical threshold.

                </span>

              </div>

            )}

          </div>

        </div>


        {/* =================================================
            COLLECTION ACTIVITY
        ================================================== */}

        <div className="overview-panel">

          <div className="panel-header">

            <h3>

              Collection activity

            </h3>

          </div>


          <div className="activity-chart">

            <div className="activity-grid">

              <span>
                {activityMax}
              </span>

              <span>
                {Math.round(
                  activityMax * 0.75
                )}
              </span>

              <span>
                {Math.round(
                  activityMax * 0.5
                )}
              </span>

              <span>
                {Math.round(
                  activityMax * 0.25
                )}
              </span>

              <span>
                0
              </span>

            </div>


            <div className="activity-bars">

              {collectionActivity.map(
                (
                  item
                ) => (

                  <div
                    className="activity-bar-wrapper"
                    key={
                      item.key
                    }
                  >

                    <div
                      className="activity-bar"
                      style={{
                        height:
                          `${Math.max(
                            item.value * 20,
                            item.value
                              ? 8
                              : 0
                          )}px`,
                      }}
                      title={
                        `${item.value} collection event${
                          item.value === 1
                            ? ""
                            : "s"
                        }`
                      }
                    />

                    <span>

                      {
                        formatTime(
                          item.label
                        )
                      }

                    </span>

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </section>


      {/* =================================================
          RECENT REQUESTS
      ================================================== */}

      <section className="overview-panel requests-panel">

        <div className="panel-header">

          <h3>

            Recent requests · All locations

          </h3>


          <Link
            className="text-link"
            to="/dashboard/collections"
          >

            Open board

            <ChevronRight
              size={15}
            />

          </Link>

        </div>


        <div className="requests-table-wrapper">

          {overviewData
            .recentRequests
            .length > 0 ? (

            <table className="requests-table">

              <thead>

                <tr>

                  <th>
                    REQUEST
                  </th>

                  <th>
                    LOCATION
                  </th>

                  <th>
                    PRIORITY
                  </th>

                  <th>
                    SCHEDULED
                  </th>

                  <th>
                    STATUS
                  </th>

                  <th>
                    ACTION
                  </th>

                </tr>

              </thead>


              <tbody>

                {overviewData
                  .recentRequests
                  .slice(0, 6)
                  .map(
                    (
                      request,
                      index
                    ) => {

                      const requestId =
                        request.requestId ??
                        request.request_id ??
                        `SIM-${index + 1}`;


                      const displayId =
                        String(
                          requestId
                        ).startsWith(
                          "REQ-"
                        )
                          ? requestId
                          : `REQ-${requestId}`;


                      const location =
                        request.location ||
                        request.location_description ||
                        request.binCode ||
                        request.bin_code ||
                        "—";


                      const priority =
                        request.priority ||
                        request.binStatus ||
                        "Medium";


                      const status =
                        request.status ||
                        "Pending";


                      const requestedAt =
                        request.requestedAt ||
                        request.requested_at;


                      return (

                        <tr
                          key={
                            `${requestId}-${index}`
                          }
                        >

                          <td className="request-id">

                            {displayId}

                          </td>


                          <td>

                            {location}

                          </td>


                          <td>

                            <span
                              className={
                                `priority-badge ${
                                  String(
                                    priority
                                  )
                                    .toLowerCase()
                                    .replaceAll(
                                      " ",
                                      "-"
                                    )
                                }`
                              }
                            >

                              {
                                priority
                              }

                            </span>

                          </td>


                          <td>

                            {
                              formatDate(
                                requestedAt
                              )
                            }

                          </td>


                          <td>

                            <span
                              className={
                                `status-badge ${
                                  String(
                                    status
                                  )
                                    .toLowerCase()
                                    .replaceAll(
                                      " ",
                                      "-"
                                    )
                                }`
                              }
                            >

                              {
                                status
                              }

                            </span>

                          </td>


                          <td>

                            <div className="request-actions">

                              <ChevronRight
                                size={16}
                              />

                            </div>

                          </td>

                        </tr>

                      );

                    }
                  )}

              </tbody>

            </table>

          ) : (

            <div className="overview-empty-state">

              Waiting for live collection requests...

            </div>

          )}

        </div>

      </section>


      {/* =================================================
          FOOTER
      ================================================== */}

      <div className="overview-footer">

        <Activity
          size={14}
        />

        Live operational data powered by FastAPI.

      </div>

    </div>
  );
}


export default Overview;