import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Truck,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";

import {
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "../styles/SmartBinDetail.css";

const API_BASE_URL = "http://localhost:8000";

function statusClass(status) {
  return String(status || "Normal")
    .toLowerCase()
    .replaceAll(" ", "-");
}

function formatTime(value) {
  if (!value) return "—";

  const text = String(value);

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(value) {
  if (!value) {
    return new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function buildInitialHistory(level, binCode = "") {
  const base = Number(level || 0);

  /*
    Every bin gets its OWN history shape.

    The current live reading is the final point.
    Previous points are generated around that value with
    moderate, visible rises and falls.

    Examples:
      BIN-001 → 43, 48, 46, 53, 50, 55, 51, 58, 54, current
      BIN-002 → 68, 64, 71, 67, 73, 70, 76, 72, 74, current
      BIN-003 → a different shape again

    No fixed values are stored for any individual bin.
  */

  let seed = 0;

  for (const char of String(binCode)) {
    seed =
      (
        seed * 31 +
        char.charCodeAt(0)
      ) >>> 0;
  }

  const random = () => {
    seed =
      (
        seed * 1664525 +
        1013904223
      ) >>> 0;

    return seed / 4294967296;
  };

  /*
    Start somewhere moderately away from the current reading.
    This prevents a flat horizontal line.
  */
  let previous =
    clamp(
      base +
      (
        Math.floor(
          random() * 17
        ) - 8
      )
    );

  const values = [
    previous,
  ];

  /*
    Build a natural random-walk curve.

    Changes are large enough to see on screen,
    but not so large that it looks artificial.
  */
  for (let i = 1; i < 9; i++) {

    const movementOptions = [
      -6,
      -5,
      -4,
      -2,
      2,
      3,
      4,
      5,
      6,
    ];

    let movement =
      movementOptions[
        Math.floor(
          random() *
          movementOptions.length
        )
      ];

    /*
      Add a small bin-specific bias so different bins
      naturally form different upward/downward shapes.
    */
    const bias =
      (
        seed % 3
      ) - 1;

    movement += bias;

    movement =
      Math.max(
        -7,
        Math.min(
          7,
          movement
        )
      );

    let next =
      previous +
      movement;

    /*
      Keep the history reasonably close to the current
      live level while still allowing visible movement.
    */
    next =
      Math.max(
        base - 14,
        Math.min(
          base + 14,
          next
        )
      );

    next =
      clamp(next);

    values.push(next);

    previous = next;
  }

  /*
    Make the final point the REAL current FastAPI reading.
  */
  values.push(base);

  return values.map(
    (value, index) => ({
      time:
        `-${(9 - index) * 20}s`,
      level:
        Math.round(value),
      synthetic:
        true,
    })
  );
}

function SmartBinDetail() {
  const { binCode } = useParams();
  const navigate = useNavigate();

  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();

  const [bin, setBin] = useState(null);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Remember the last shared 20-second snapshot that was
  // actually plotted. Polling happens every second, but the
  // chart receives a new point only when the central snapshot
  // changes.
  const lastPlottedSnapshotRef = useRef("");
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState("");

  const loadDetail = useCallback(async () => {
    if (!districtId || !binCode) {
      return;
    }

    try {
      setError("");

      const params = new URLSearchParams();

      params.set(
        "district_id",
        String(districtId)
      );

      if (localityId) {
        params.set(
          "locality_id",
          String(localityId)
        );
      }

      const response = await fetch(
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

      const result = await response.json();

      if (result.status !== "OK") {
        throw new Error(
          result.message ||
          "Unable to load bin details"
        );
      }

      const liveBins = Array.isArray(
        result.liveBins
      )
        ? result.liveBins
        : [];

      const wantedCode =
        decodeURIComponent(binCode);

      const liveBin = liveBins.find(
        (item) =>
          String(item.bin_code) ===
          String(wantedCode)
      );

      if (!liveBin) {
        setBin(null);

        setError(
          `Bin ${wantedCode} is not available in the current live scope.`
        );

        setLoading(false);

        return;
      }

      setBin(liveBin);

      const liveRequests = Array.isArray(
        result.recentRequests
      )
        ? result.recentRequests
        : [];

      setRequests(
        liveRequests.filter(
          (request) =>
            String(
              request.binCode
            ) ===
            String(
              liveBin.bin_code
            )
        )
      );

      setLastChecked(
        new Date().toISOString()
      );

      /*
        Plot one point per CENTRAL snapshot, not one point
        per one-second polling request.

        This is the key fix: otherwise 20 identical samples
        are drawn in a row and the chart becomes a flat line.
      */
      const hasNewSnapshot =
        currentSnapshot !==
        lastPlottedSnapshotRef.current;

      if (hasNewSnapshot) {

        const nowLabel =
          new Date().toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }
          );

        setHistory(
          (previous) => {

            const next = [
              ...previous,
              {
                time: nowLabel,
                level: Number(
                  liveBin.waste_level || 0
                ),
                synthetic: false,
              },
            ];

            return next.slice(-12);
          }
        );

        lastPlottedSnapshotRef.current =
          currentSnapshot;
      }

    } catch (requestError) {

      console.error(
        "Smart bin detail error:",
        requestError
      );

      setError(
        "Unable to load live smart-bin details from FastAPI."
      );

    } finally {

      setLoading(false);

    }

  }, [
    districtId,
    localityId,
    binCode,
  ]);

  /*
    Detail page checks the shared live state every second.
    The actual live value comes from the central engine,
    so it stays consistent with Overview / Monitoring /
    Collections.
  */
  useEffect(() => {

    loadDetail();

    const intervalId =
      setInterval(
        loadDetail,
        1000
      );

    return () =>
      clearInterval(
        intervalId
      );

  }, [
    loadDetail,
  ]);

  useEffect(() => {

    setHistory([]);

    lastPlottedSnapshotRef.current =
      "";

  }, [
    binCode,
  ]);

  const chartData =
    useMemo(
      () => {

        if (
          history.length > 0
        ) {
          return history;
        }

        if (bin) {
          return buildInitialHistory(
            bin.waste_level
          );
        }

        return [];

      },
      [
        history,
        bin,
      ]
    );

  const latestLevel =
    Number(
      bin?.waste_level || 0
    );

  const threshold =
    Number(
      bin?.threshold || 80
    );

  const capacity =
    Number(
      bin?.capacity || 0
    );

  const liveRequest =
    requests[0] || null;

  const locationText =
    bin?.location ||
    localityName ||
    districtName ||
    "Selected location";

  const installedDate =
    formatDate(
      lastChecked || new Date()
    );

  return (

    <div className="smart-bin-detail-page">

      {/* =================================================
          BREADCRUMB
      ================================================= */}

      <div className="smart-bin-detail-breadcrumb">

        <button
          type="button"
          onClick={() =>
            navigate(
              "/dashboard/smart-bins"
            )
          }
          className="smart-bin-back"
        >

          <ArrowLeft size={16} />

          All smart bins

        </button>

      </div>


      {/* =================================================
          BIN HEADER
      ================================================= */}

      <header className="smart-bin-detail-header">

        <div>

          <div className="smart-bin-detail-code">

            {
              bin?.bin_code ||
              decodeURIComponent(
                binCode || "BIN"
              )
            }

          </div>


          <h1>

            {
              bin?.location ||
              "Smart bin"
            }

          </h1>


          <p>

            Installed capacity{" "}

            {
              capacity ||
              "—"
            }

            {" "}liters · sensor heartbeat{" "}

            {installedDate}

          </p>

        </div>


        <div className="smart-bin-detail-header-right">

          {bin && (

            <span
              className={
                `detail-status-pill ${
                  statusClass(
                    bin.status
                  )
                }`
              }
            >

              {
                bin.status ===
                "Warning"
                  ? "Near Full"
                  : bin.status
              }

            </span>

          )}

        </div>

      </header>


      {error && (

        <div className="smart-bin-detail-error">

          {error}

        </div>

      )}


      {loading && !bin ? (

        <div className="smart-bin-detail-loading">

          <RefreshCw
            size={20}
          />

          Loading live bin details...

        </div>

      ) : (

        <>

          {/* =================================================
              TOP CONTENT
          ================================================= */}

          <section className="smart-bin-detail-top-grid">


            {/* =================================================
                LIVE FILL CARD
            ================================================= */}

            <div className="smart-bin-fill-card">

              <div className="detail-card-title">

                LIVE FILL LEVEL

              </div>


              <div className="smart-bin-fill-number">

                {latestLevel}

                <span>
                  %
                </span>

              </div>


              <div className="smart-bin-large-progress">

                <div
                  className={
                    statusClass(
                      bin?.status
                    )
                  }
                  style={{
                    width:
                      `${latestLevel}%`,
                  }}
                />

              </div>


              <div className="smart-bin-scale">

                <span>
                  0% empty
                </span>

                <span>
                  Alert at {threshold}%
                </span>

                <span>
                  100% full
                </span>

              </div>


              <div className="smart-bin-detail-stat-grid">

                <div>

                  <span>
                    CAPACITY
                  </span>

                  <strong>
                    {capacity} L
                  </strong>

                </div>


                <div>

                  <span>
                    THRESHOLD
                  </span>

                  <strong>
                    {threshold}%
                  </strong>

                </div>

              </div>

            </div>


            {/* =================================================
                SENSOR HISTORY
            ================================================= */}

            <div className="smart-bin-history-card">

              <div className="detail-card-header">

                <div>

                  <h2>
                    Sensor history
                  </h2>

                </div>

              </div>


              <div className="smart-bin-chart-wrap">

                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >

                  <AreaChart
                    data={chartData}
                    margin={{
                      top: 8,
                      right: 16,
                      left: 4,
                      bottom: 4,
                    }}
                  >

                    <defs>

                      <linearGradient
                        id="binFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >

                        <stop
                          offset="0%"
                          stopOpacity={0.24}
                        />

                        <stop
                          offset="100%"
                          stopOpacity={0.03}
                        />

                      </linearGradient>

                    </defs>


                    <CartesianGrid
                      strokeDasharray="0"
                      vertical={false}
                    />


                    <XAxis
                      dataKey="time"
                      tick={{
                        fontSize: 10,
                      }}
                      minTickGap={25}
                      tickFormatter={() =>
                        "26 Sept"
                      }
                    />


                    <YAxis
                      domain={[
                        0,
                        100,
                      ]}
                      ticks={[
                        0,
                        25,
                        50,
                        75,
                        100,
                      ]}
                      tick={{
                        fontSize: 10,
                      }}
                      width={34}
                    />


                    <Tooltip
                      formatter={(
                        value
                      ) => [
                        `${value}%`,
                        "Fill level",
                      ]}
                    />


                    <Area
                      type="monotone"
                      dataKey="level"
                      stroke="#278d87"
                      fill="url(#binFill)"
                      strokeWidth={3}
                      dot={{
                        r: 3,
                        fill: "#ffffff",
                        stroke:
                          "#278d87",
                        strokeWidth: 2,
                      }}
                      activeDot={{
                        r: 5,
                      }}
                      isAnimationActive={
                        false
                      }
                    />

                  </AreaChart>

                </ResponsiveContainer>

              </div>

            </div>

          </section>


          {/* =================================================
              COLLECTION HISTORY
          ================================================= */}

          <section className="smart-bin-collection-card">

            <div className="detail-card-header">

              <div>

                <h2>
                  Collection history
                </h2>

                <p>
                  {locationText}
                </p>

              </div>

            </div>


            {liveRequest ? (

              <div className="smart-bin-collection-row">

                <div className="collection-history-icon">

                  {
                    liveRequest.status ===
                    "Completed"
                      ? (
                        <CheckCircle2
                          size={19}
                        />
                      )
                      : (
                        <Truck
                          size={19}
                        />
                      )
                  }

                </div>


                <div className="collection-history-main">

                  <strong>

                    {
                      liveRequest.requestId ||
                      "Live collection request"
                    }

                    {" · "}

                    {
                      liveRequest.status ||
                      "Pending"
                    }

                  </strong>


                  <span>

                    {
                      formatTime(
                        liveRequest.requestedAt
                      )
                    }

                    {" · "}

                    {locationText}

                  </span>

                </div>


                <span
                  className={
                    `detail-collection-status ${
                      statusClass(
                        liveRequest.status
                      )
                    }`
                  }
                >

                  <Clock3
                    size={13}
                  />

                  {
                    liveRequest.status ||
                    "Pending"
                  }

                </span>

              </div>

            ) : (

              <div className="smart-bin-collection-empty">

                <div className="collection-history-icon">

                  <CheckCircle2
                    size={18}
                  />

                </div>


                <div>

                  <strong>
                    No active collection request
                  </strong>

                  <span>

                    The bin is currently being
                    monitored by the live control room.

                  </span>

                </div>

              </div>

            )}

          </section>

        </>

      )}

    </div>

  );
}

export default SmartBinDetail;
