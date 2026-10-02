import {
  ArrowRight,
  LocateFixed,
  RefreshCw,
  Route as RouteIcon,
  Truck,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import "../styles/Route-Optimization.css";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

const API_BASE_URL = "http://localhost:8000";

function MapRecenter({ center }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;

    map.setView(
      [center.lat, center.lng],
      14,
      { animate: true }
    );
  }, [center, map]);

  return null;
}


function createRouteBinIcon(status) {
  const normalized = String(status || "Normal").toLowerCase();

  let className = "normal";

  if (normalized === "critical") {
    className = "critical";
  } else if (normalized === "warning") {
    className = "warning";
  }

  return L.divIcon({
    className: "route-bin-div-icon",
    html: `
      <div class="route-reference-bin-marker ${className}">
        <div class="route-reference-bin-glow"></div>

        <div class="route-reference-bin-core">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9 5V3.8C9 3.36 9.36 3 9.8 3H14.2C14.64 3 15 3.36 15 3.8V5"
              stroke="white"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M5 6H19"
              stroke="white"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M7 6.5L7.8 19.1C7.85 19.83 8.46 20.4 9.2 20.4H14.8C15.54 20.4 16.15 19.83 16.2 19.1L17 6.5"
              stroke="white"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
            <path
              d="M10.5 10V16.5M13.5 10V16.5"
              stroke="white"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
        </div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -22],
  });
}

function RouteOptimization() {
  const navigate = useNavigate();

  const {
    districtId,
    localityId,
    localityName,
  } = useOutletContext();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadRoutes = useCallback(
    async (manual = false) => {
      try {
        setError("");

        if (manual) {
          setRefreshing(true);
        }

        if (!districtId) {
          setData(null);
          setLoading(false);
          return;
        }

        const baseParams = new URLSearchParams();

        baseParams.set(
          "district_id",
          String(districtId)
        );

        if (
          localityId !== null &&
          localityId !== undefined
        ) {
          baseParams.set(
            "locality_id",
            String(localityId)
          );
        }

        baseParams.set(
          "_",
          String(Date.now())
        );

        /*
          IMPORTANT:
          Route Optimization uses two shared views of the same
          FastAPI engine state.

          1. /api/route-optimization
             -> route positions + driver + vehicle

          2. /api/overview-live
             -> the live fill level/status used by Monitoring
                and Collections

          We merge them by BIN CODE so every page shows the
          same current waste level.
        */

        if (manual) {
          baseParams.set("force", "true");
        }

        const routeResponse = await fetch(
          `${API_BASE_URL}/api/route-optimization?${baseParams.toString()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );

        if (!routeResponse.ok) {
          throw new Error(
            `Route API returned ${routeResponse.status}`
          );
        }

        const routeResult =
          await routeResponse.json();

        if (routeResult.status !== "OK") {
          throw new Error(
            routeResult.message ||
              "Unable to load route data."
          );
        }

        /*
          Do not force the second call. If the first call just
          created the new forced snapshot, this call reads that
          same snapshot instead of advancing it again.
        */
        const overviewParams =
          new URLSearchParams();

        overviewParams.set(
          "district_id",
          String(districtId)
        );

        if (
          localityId !== null &&
          localityId !== undefined
        ) {
          overviewParams.set(
            "locality_id",
            String(localityId)
          );
        }

        overviewParams.set(
          "_",
          String(Date.now())
        );

        const overviewResponse = await fetch(
          `${API_BASE_URL}/api/overview-live?${overviewParams.toString()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );

        if (!overviewResponse.ok) {
          throw new Error(
            `Overview API returned ${overviewResponse.status}`
          );
        }

        const overviewResult =
          await overviewResponse.json();

        if (
          overviewResult.status !== "OK"
        ) {
          throw new Error(
            overviewResult.message ||
              "Unable to load live bin data."
          );
        }

        const liveBins =
          Array.isArray(
            overviewResult.liveBins
          )
            ? overviewResult.liveBins
            : [];

        const liveBinLookup = new Map(
          liveBins.map((bin) => [
            String(bin.bin_code),
            bin,
          ])
        );

        const routeStops =
          Array.isArray(
            routeResult.stops
          )
            ? routeResult.stops.map((stop) => {
                const liveBin =
                  liveBinLookup.get(
                    String(stop.bin_code)
                  );

                return {
                  ...stop,

                  /*
                    Monitoring/Collections are the source of
                    the current live fill level.
                  */
                  level: Number(
                    liveBin?.waste_level ??
                      liveBin?.level ??
                      stop.level ??
                      0
                  ),

                  status:
                    liveBin?.status ||
                    stop.status ||
                    "Normal",

                  threshold: Number(
                    liveBin?.threshold ??
                      stop.threshold ??
                      80
                  ),

                  capacity: Number(
                    liveBin?.capacity ??
                      stop.capacity ??
                      0
                  ),
                };
              })
            : [];

        /*
          Match the Collections sidebar exactly.

          Collections counts:
          enrichedRequests.filter(
            request => request.vehicle !== "Unassigned"
          ).length
        */
        const recentRequests =
          Array.isArray(
            overviewResult.recentRequests
          )
            ? overviewResult.recentRequests
            : [];

        const assignedVehicleCount =
          recentRequests.filter(
            (request) => {
              const vehicle =
                request.vehicle ||
                request.vehicleNumber ||
                request.vehicle_number ||
                "Unassigned";

              return vehicle !== "Unassigned";
            }
          ).length;

        const criticalCount =
          routeStops.filter(
            (stop) =>
              String(
                stop.status
              ).toLowerCase() === "critical"
          ).length;

        const warningCount =
          routeStops.filter(
            (stop) =>
              String(
                stop.status
              ).toLowerCase() === "warning"
          ).length;

        const normalCount =
          routeStops.filter(
            (stop) =>
              String(
                stop.status
              ).toLowerCase() === "normal"
          ).length;

        const mergedResult = {
          ...routeResult,

          stops: routeStops,

          summary: {
            ...routeResult.summary,

            stops:
              routeStops.length,

            /*
              EXACT SAME NUMBER SHOWN AS
              "Assigned vehicles" IN COLLECTIONS.
            */
            vehicles:
              assignedVehicleCount,

            critical:
              criticalCount,

            warning:
              warningCount,

            normal:
              normalCount,
          },
        };

        setData(
          mergedResult
        );

      } catch (err) {
        console.error(
          "Route optimization error:",
          err
        );

        setError(
          "Unable to load route data from FastAPI."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      districtId,
      localityId,
    ]
  );

  useEffect(() => {
    loadRoutes();

    const timer = setInterval(
      () => loadRoutes(),
      20000
    );

    return () => clearInterval(timer);
  }, [loadRoutes]);

  const stops = useMemo(() => {
    return Array.isArray(data?.stops)
      ? data.stops
      : [];
  }, [data]);

  if (loading) {
    return (
      <div className="route-page">
        <div className="route-loading">
          Loading route optimization...
        </div>
      </div>
    );
  }

  const center =
    data?.map_center || {
      lat: 17.385,
      lng: 78.4867,
    };

  const summary =
    data?.summary || {
      stops: stops.length,
      vehicles: 0,
      critical: 0,
      warning: 0,
      normal: stops.length,
    };

  const locality =
    data?.locality_name ||
    localityName ||
    "Selected locality";

  return (
    <div className="route-page">

      <div className="route-header">

        <div>
          <span className="route-eyebrow">
            CONTROL ROOM
          </span>

          <h1>
            Route Optimization
          </h1>

          <p>
            Priority-based collection planning
            for {locality}.
          </p>
        </div>

        <div className="route-header-actions">

          <span className="route-live">
            <span className="route-live-dot" />
            LIVE
          </span>

          <button
            type="button"
            className="route-button"
            onClick={() =>
              loadRoutes(true)
            }
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? "route-spin"
                  : ""
              }
            />

            {refreshing
              ? "Refreshing..."
              : "Recalculate Route"}
          </button>

        </div>

      </div>

      <div className="route-summary">

        <div className="route-summary-card">
          <RouteIcon size={21} />

          <div>
            <span>STOPS</span>
            <strong>
              {summary.stops}
            </strong>
          </div>
        </div>

        <div className="route-summary-card">
          <Truck size={21} />

          <div>
            <span>VEHICLES</span>
            <strong>
              {summary.vehicles}
            </strong>
          </div>
        </div>

        <div className="route-summary-card">
          <LocateFixed size={21} />

          <div>
            <span>ROUTE MODE</span>
            <strong>
              Critical First
            </strong>
          </div>
        </div>

      </div>

      <div className="route-status-strip">

        <span className="route-status-item critical">
          <b />
          {summary.critical} Critical
        </span>

        <span className="route-status-item warning">
          <b />
          {summary.warning} Warning
        </span>

        <span className="route-status-item normal">
          <b />
          {summary.normal} Normal
        </span>

        <span className="route-updated">
          Updated{" "}
          {data?.updated_at
            ? new Date(
                data.updated_at
              ).toLocaleTimeString(
                "en-IN"
              )
            : "—"}
        </span>

      </div>

      {error && (
        <div className="route-error">
          {error}
        </div>
      )}

      <div className="route-layout">

        <section className="route-map-card">

          <div className="route-map-title">

            <div>
              <h2>
                Collection route
              </h2>

              <p>
                All live bins in {locality}
              </p>
            </div>

            <div className="route-all-bins-badge">
              <span>LIVE BINS</span>
              <strong>
                {stops.length}
              </strong>
            </div>

          </div>

          <div className="route-real-map">

            <MapContainer
              center={[
                center.lat,
                center.lng,
              ]}
              zoom={14}
              scrollWheelZoom
              className="route-leaflet-map"
            >

              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapRecenter
                center={center}
              />

              {stops.map((stop) => (
                <Marker
                  key={stop.bin_code}
                  position={[
                    stop.lat,
                    stop.lng,
                  ]}
                  icon={createRouteBinIcon(stop.status)}
                  eventHandlers={{
                    click: () =>
                      navigate(
                        `/dashboard/route-optimization/${stop.bin_code}`
                      ),
                  }}
                >
                  <Tooltip direction="top">
                    <strong>
                      {stop.bin_code}
                    </strong>
                    <br />
                    {stop.location}
                    <br />
                    {stop.level}% · {stop.status}
                  </Tooltip>

                  <Popup>
                    <strong>
                      {stop.bin_code}
                    </strong>
                    <br />
                    {stop.location}
                    <br />
                    {stop.level}% full
                    <br />
                    Status: {stop.status}
                    <br />
                    <button
                      type="button"
                      className="route-popup-button"
                      onClick={() =>
                        navigate(
                          `/dashboard/route-optimization/${stop.bin_code}`
                        )
                      }
                    >
                      View route
                    </button>
                  </Popup>
                </Marker>
              ))}

            </MapContainer>

            <div className="route-map-overview-hint">
              Click any bin marker or any arrow on the
              right to open its driver-to-bin route.
            </div>

          </div>

        </section>

        <section className="route-panel">

          <div className="route-panel-header">

            <div>
              <h2>
                Recommended route
              </h2>

              <p>
                Critical bins first, then highest
                fill level.
              </p>
            </div>

            <span className="route-stop-count">
              {summary.stops} stops
            </span>

          </div>

          <div className="route-priority-bar">

            <span className="route-priority-pill critical">
              Critical first
            </span>

            <span className="route-priority-pill">
              Highest fill first
            </span>

          </div>

          <div className="route-stop-list">

            {stops.map((stop) => (

              <button
                type="button"
                key={stop.bin_code}
                className="route-list-item"
                onClick={() =>
                  navigate(
                    `/dashboard/route-optimization/${stop.bin_code}`
                  )
                }
                title={`Open route for ${stop.bin_code}`}
              >

                <div className="route-list-number">
                  {stop.rank}
                </div>

                <div className="route-list-content">

                  <div className="route-list-title-row">

                    <strong>
                      {stop.location}
                    </strong>

                    <span
                      className={`route-priority-tag ${
                        String(
                          stop.priority ||
                            "Medium"
                        ).toLowerCase()
                      }`}
                    >
                      {stop.priority ||
                        stop.status}
                    </span>

                  </div>

                  <span className="route-list-meta">
                    {stop.bin_code}
                    {" · "}
                    {stop.level}% full
                  </span>

                  <span className="route-driver-line">
                    <Truck size={13} />
                    {stop.collector ||
                      "Unassigned"}
                    {" · "}
                    {stop.vehicle ||
                      "Unassigned"}
                  </span>

                </div>

                <ArrowRight
                  size={17}
                  className="route-list-arrow"
                />

              </button>

            ))}

          </div>

        </section>

      </div>

    </div>
  );
}

export default RouteOptimization;
