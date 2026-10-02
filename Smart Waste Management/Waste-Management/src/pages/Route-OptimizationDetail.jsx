import {
  ArrowLeft,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Truck,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import {
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";

import "../styles/Route-Optimization.css";
import "../styles/Route-OptimizationDetail.css";
import "leaflet/dist/leaflet.css";

const API_BASE_URL =
  "http://localhost:8000";

const OSRM_URL =
  "https://router.project-osrm.org/route/v1/driving";

function FitRoute({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length < 2) {
      return;
    }

    map.fitBounds(points, {
      padding: [65, 65],
      maxZoom: 16,
      animate: true,
    });
  }, [points, map]);

  return null;
}

function AnimatedDriver({
  position,
  collector,
  vehicle,
}) {
  if (!position) return null;

  const icon =
    L.divIcon({
      className:
        "animated-driver-icon",
      html: `
        <div class="animated-driver-marker">
          <div class="animated-driver-pulse"></div>
          <div class="animated-driver-core">🚛</div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

  return (
    <Marker
      position={position}
      icon={icon}
    >
      <Tooltip
        permanent
        direction="top"
      >
        <strong>
          {collector}
        </strong>
      </Tooltip>

      <Popup>
        <strong>
          {collector}
        </strong>
        <br />
        {vehicle}
      </Popup>
    </Marker>
  );
}

function RouteOptimizationDetail() {
  const {
    binCode,
  } = useParams();

  const navigate = useNavigate();

  const {
    districtId,
    localityId,
    localityName,
  } = useOutletContext();

  const [data, setData] =
    useState(null);

  const [stop, setStop] =
    useState(null);

  const [roadRoute, setRoadRoute] =
    useState([]);

  const [driverPosition,
    setDriverPosition] =
    useState(null);

  const [routeDistance,
    setRouteDistance] =
    useState(null);

  const [routeDuration,
    setRouteDuration] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [routeLoading,
    setRouteLoading] =
    useState(false);

  const [playing, setPlaying] =
    useState(false);

  const [error, setError] =
    useState("");

  const animationRef =
    useRef(null);

  const loadData =
    useCallback(
      async () => {
        try {
          setError("");

          const params =
            new URLSearchParams();

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

          params.set(
            "_",
            String(Date.now())
          );

          const response =
            await fetch(
              `${API_BASE_URL}/api/route-optimization?${params}`,
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
            result.status !==
            "OK"
          ) {
            throw new Error(
              result.message ||
                "Unable to load route data."
            );
          }

          const current =
            Array.isArray(
              result.stops
            )
              ? result.stops.find(
                  (item) =>
                    String(
                      item.bin_code
                    ) ===
                    String(binCode)
                )
              : null;

          if (!current) {
            throw new Error(
              `Bin ${binCode} was not found.`
            );
          }

          /*
            IMPORTANT:
            Route detail must show the SAME live fill level/status
            as Live Monitoring and Collections.

            The route endpoint provides the driver, vehicle and
            route coordinates. The overview-live endpoint provides
            the current live bin reading. Merge them by bin code.
          */
          const liveParams =
            new URLSearchParams();

          liveParams.set(
            "district_id",
            String(districtId)
          );

          if (
            localityId !== null &&
            localityId !== undefined
          ) {
            liveParams.set(
              "locality_id",
              String(localityId)
            );
          }

          liveParams.set(
            "_",
            String(Date.now())
          );

          const liveResponse =
            await fetch(
              `${API_BASE_URL}/api/overview-live?${liveParams}`,
              {
                cache: "no-store",
                headers: {
                  "Cache-Control": "no-cache",
                },
              }
            );

          if (!liveResponse.ok) {
            throw new Error(
              `Live overview returned ${liveResponse.status}`
            );
          }

          const liveResult =
            await liveResponse.json();

          const liveBins =
            Array.isArray(
              liveResult?.liveBins
            )
              ? liveResult.liveBins
              : [];

          const liveBin =
            liveBins.find(
              (item) =>
                String(
                  item.bin_code
                ) ===
                String(binCode)
            );

          const mergedStop = {
            ...current,

            level: Number(
              liveBin?.waste_level ??
                liveBin?.level ??
                current.level ??
                0
            ),

            status:
              liveBin?.status ||
              current.status ||
              "Normal",

            threshold: Number(
              liveBin?.threshold ??
                current.threshold ??
                80
            ),

            capacity: Number(
              liveBin?.capacity ??
                current.capacity ??
                0
            ),
          };

          setData({
            ...result,
            liveBins,
          });

          setStop(
            mergedStop
          );
        } catch (err) {
          console.error(
            "Route detail error:",
            err
          );

          setError(
            "Unable to load the selected bin route from FastAPI."
          );
        } finally {
          setLoading(false);
        }
      },
      [districtId, localityId, binCode]
    );

  useEffect(() => {
    loadData();

    const timer =
      setInterval(
        loadData,
        20000
      );

    return () =>
      clearInterval(timer);
  }, [loadData]);

  const loadRoadRoute =
    useCallback(
      async (currentStop) => {
        if (!currentStop) return;

        setRouteLoading(true);

        try {
          const coordinates =
            `${currentStop.driver_lng},${currentStop.driver_lat};` +
            `${currentStop.lng},${currentStop.lat}`;

          const response =
            await fetch(
              `${OSRM_URL}/${coordinates}` +
                `?overview=full&geometries=geojson`
            );

          if (!response.ok) {
            throw new Error(
              `OSRM returned ${response.status}`
            );
          }

          const result =
            await response.json();

          if (
            result.code !== "Ok" ||
            !result.routes?.length
          ) {
            throw new Error(
              "No road route was found."
            );
          }

          const route =
            result.routes[0];

          const points =
            (
              route.geometry
                ?.coordinates || []
            ).map(
              ([lng, lat]) =>
                [lat, lng]
            );

          setRoadRoute(points);

          setRouteDistance(
            route.distance
          );

          setRouteDuration(
            route.duration
          );

          setDriverPosition(
            points[0] || [
              currentStop.driver_lat,
              currentStop.driver_lng,
            ]
          );
        } catch (err) {
          console.error(
            "Road route error:",
            err
          );

          const fallback = [
            [
              currentStop.driver_lat,
              currentStop.driver_lng,
            ],
            [
              currentStop.lat,
              currentStop.lng,
            ],
          ];

          setRoadRoute(
            fallback
          );

          setRouteDistance(null);
          setRouteDuration(null);
          setDriverPosition(
            fallback[0]
          );
        } finally {
          setRouteLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    if (!stop) return;

    loadRoadRoute(stop);
  }, [stop, loadRoadRoute]);

  const animateDriver =
    useCallback(() => {
      if (
        roadRoute.length < 2
      ) {
        return;
      }

      if (animationRef.current) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      setPlaying(true);

      const duration =
        Math.max(
          8000,
          Math.min(
            16000,
            (routeDuration || 10) *
              1000
          )
        );

      const startTime =
        performance.now();

      const step =
        (currentTime) => {
          const progress =
            Math.min(
              1,
              (currentTime -
                startTime) /
                duration
            );

          const scaled =
            progress *
            (roadRoute.length -
              1);

          const index =
            Math.min(
              roadRoute.length -
                2,
              Math.floor(
                scaled
              )
            );

          const local =
            scaled - index;

          const from =
            roadRoute[index];

          const to =
            roadRoute[
              index + 1
            ];

          setDriverPosition([
            from[0] +
              (to[0] -
                from[0]) *
                local,
            from[1] +
              (to[1] -
                from[1]) *
                local,
          ]);

          if (progress < 1) {
            animationRef.current =
              requestAnimationFrame(
                step
              );
          } else {
            setDriverPosition(
              roadRoute[
                roadRoute.length -
                  1
              ]
            );

            setPlaying(false);
          }
        };

      animationRef.current =
        requestAnimationFrame(
          step
        );
    }, [roadRoute, routeDuration]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(
          animationRef.current
        );
      }
    };
  }, []);

  // Automatically start the movement shortly after the detail page opens.
  useEffect(() => {
    if (
      roadRoute.length < 2 ||
      routeLoading ||
      playing
    ) {
      return;
    }

    const timer =
      setTimeout(
        () => animateDriver(),
        900
      );

    return () =>
      clearTimeout(timer);
  }, [
    roadRoute,
    routeLoading,
  ]);

  if (loading) {
    return (
      <div className="route-page">
        <div className="route-loading">
          Loading selected route...
        </div>
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="route-page">

        <button
          type="button"
          className="route-back-button"
          onClick={() =>
            navigate(
              "/dashboard/route-optimization"
            )
          }
        >
          <ArrowLeft size={16} />
          Back to route optimization
        </button>

        <div className="route-error">
          {error ||
            "Selected bin was not found."}
        </div>

      </div>
    );
  }

  const status =
    stop.status || "Normal";

  const priority =
    stop.priority || "Medium";

  const locality =
    data?.locality_name ||
    localityName ||
    "Selected locality";

  const distanceText =
    routeDistance !== null
      ? `${(
          routeDistance / 1000
        ).toFixed(1)} km`
      : "—";

  const durationText =
    routeDuration !== null
      ? `${Math.ceil(
          routeDuration / 60
        )} min`
      : "—";

  const mapPoints =
    roadRoute.length > 1
      ? roadRoute
      : [
          [
            stop.driver_lat,
            stop.driver_lng,
          ],
          [
            stop.lat,
            stop.lng,
          ],
        ];

  return (
    <div className="route-page route-detail-page">

      <button
        type="button"
        className="route-back-button"
        onClick={() =>
          navigate(
            "/dashboard/route-optimization"
          )
        }
      >
        <ArrowLeft size={16} />
        Back to route optimization
      </button>

      <div className="route-detail-header">

        <div>
          <span className="route-eyebrow">
            ROUTE DETAIL
          </span>

          <h1>
            {stop.location}
          </h1>

          <p>
            {stop.bin_code}
            {" · "}
            Driver-to-bin live movement
            {" · "}
            {locality}
          </p>
        </div>

        <div className="route-detail-actions">

          <span
            className={`route-priority-tag ${
              priority.toLowerCase()
            }`}
          >
            {priority}
          </span>

          <button
            type="button"
            className="route-button"
            onClick={animateDriver}
            disabled={
              playing ||
              roadRoute.length < 2
            }
          >
            <Navigation size={16} />

            {playing
              ? "Driver moving..."
              : "Replay movement"}
          </button>

        </div>

      </div>

      <div className="route-detail-summary">

        <div>
          <span>DRIVER</span>
          <strong>
            {stop.collector ||
              "Unassigned"}
          </strong>
        </div>

        <div>
          <span>VEHICLE</span>
          <strong>
            {stop.vehicle ||
              "Unassigned"}
          </strong>
        </div>

        <div>
          <span>BIN FILL</span>
          <strong>
            {stop.level}%
          </strong>
        </div>

        <div>
          <span>ROUTE</span>
          <strong>
            {distanceText}
          </strong>
        </div>

      </div>

      <div className="route-detail-layout">

        <section className="route-detail-map-card">

          <div className="route-detail-map-header">

            <div>
              <h2>
                Driver route to{" "}
                {stop.bin_code}
              </h2>

              <p>
                The map shows the driver's road
                movement to the selected bin.
              </p>
            </div>

            <div className="route-detail-road-stats">

              <strong>
                {distanceText}
              </strong>

              <span>
                {durationText}
              </span>

            </div>

          </div>

          <div className="route-detail-map">

            <MapContainer
              center={[
                stop.driver_lat,
                stop.driver_lng,
              ]}
              zoom={14}
              scrollWheelZoom
              className="route-leaflet-map"
            >

              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitRoute
                points={mapPoints}
              />

              <CircleMarker
                center={[
                  stop.lat,
                  stop.lng,
                ]}
                radius={16}
                pathOptions={{
                  color: "#ffffff",
                  weight: 4,
                  fillColor:
                    status ===
                    "Critical"
                      ? "#ef4444"
                      : status ===
                        "Warning"
                      ? "#f59e0b"
                      : "#2ba27f",
                  fillOpacity: 1,
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                >
                  {stop.bin_code}
                </Tooltip>

                <Popup>
                  <strong>
                    {stop.bin_code}
                  </strong>
                  <br />
                  {stop.location}
                  <br />
                  {stop.level}% full
                </Popup>
              </CircleMarker>

              <AnimatedDriver
                position={
                  driverPosition
                }
                collector={
                  stop.collector ||
                  "Unassigned"
                }
                vehicle={
                  stop.vehicle ||
                  "Unassigned"
                }
              />

              <Polyline
                positions={
                  mapPoints
                }
                pathOptions={{
                  color:
                    status ===
                    "Critical"
                      ? "#ef4444"
                      : status ===
                        "Warning"
                      ? "#f0a31b"
                      : "#248f84",
                  weight: 7,
                  opacity: 0.9,
                }}
              />

            </MapContainer>

            <div className="route-detail-map-overlay">

              <span>
                LIVE MOVEMENT
              </span>

              <strong>
                🚛{" "}
                {stop.collector ||
                  "Unassigned"}
                {" → "}
                {stop.bin_code}
              </strong>

              <small>
                {routeLoading
                  ? "Calculating road route..."
                  : playing
                  ? "Driver is moving along the selected road route..."
                  : "Movement completed. Use Replay movement to run it again."}
              </small>

            </div>

          </div>

        </section>

        <section className="route-detail-side">

          <div className="route-detail-side-heading">

            <RouteIcon size={19} />

            <div>
              <h2>
                Selected collection stop
              </h2>

              <p>
                This is the exact bin chosen from
                the recommended route.
              </p>
            </div>

          </div>

          <div className="route-detail-stop-card">

            <div className="route-detail-bin-code">
              {stop.bin_code}
            </div>

            <h3>
              {stop.location}
            </h3>

            <span className="route-detail-location">
              <MapPin size={14} />
              {locality}
            </span>

            <div
              className={`route-detail-level ${status.toLowerCase()}`}
            >
              <span>
                Current fill level
              </span>

              <strong>
                {stop.level}%
              </strong>
            </div>

            <div className="route-detail-progress">
              <div
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      Number(
                        stop.level
                      ) || 0
                    )
                  )}%`,
                }}
              />
            </div>

            <div className="route-detail-info-grid">

              <div>
                <span>Driver</span>
                <strong>
                  {stop.collector ||
                    "Unassigned"}
                </strong>
              </div>

              <div>
                <span>Vehicle</span>
                <strong>
                  {stop.vehicle ||
                    "Unassigned"}
                </strong>
              </div>

              <div>
                <span>Priority</span>
                <strong>
                  {priority}
                </strong>
              </div>

              <div>
                <span>Route time</span>
                <strong>
                  {durationText}
                </strong>
              </div>

            </div>

            <button
              type="button"
              className="route-detail-back-list"
              onClick={() =>
                navigate(
                  "/dashboard/route-optimization"
                )
              }
            >
              <ArrowLeft size={15} />
              Back to all bins
            </button>

          </div>

          <div className="route-detail-flow">

            <div className="route-flow-node">

              <div className="route-flow-icon driver">
                🚛
              </div>

              <div>
                <span>START</span>
                <strong>
                  {stop.collector ||
                    "Unassigned"}
                </strong>
                <small>
                  {stop.vehicle ||
                    "Unassigned"}
                </small>
              </div>

            </div>

            <div className="route-flow-line">

              <div
                className={
                  playing
                    ? "route-flow-truck"
                    : ""
                }
              >
                {playing ? "🚛" : ""}
              </div>

            </div>

            <div className="route-flow-node">

              <div className="route-flow-icon bin">
                🗑️
              </div>

              <div>
                <span>
                  DESTINATION
                </span>

                <strong>
                  {stop.bin_code}
                </strong>

                <small>
                  {stop.location}
                </small>
              </div>

            </div>

          </div>

        </section>

      </div>

    </div>
  );
}

export default RouteOptimizationDetail;
