import {
  ArrowLeft,
  ClipboardList,
  Mail,
  MapPin,
  Truck,
  User,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";

import "../styles/CollectorDetail.css";

const API_BASE_URL = "http://localhost:8000";

function normalizeStatus(status) {
  const value = String(status || "Available").toLowerCase();

  if (value === "assigned" || value === "busy") return "Busy";
  if (value === "inactive" || value === "offline") return "Offline";
  return "Available";
}

function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "C";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CollectorDetail() {
  const { collectorId } = useParams();
  const navigate = useNavigate();

  const {
    districtName,
    localityName,
  } = useOutletContext();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(
    async () => {
      try {
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/collector-detail/${collectorId}?_=${Date.now()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
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
            "Unable to load collector."
          );
        }

        setData(result);
      } catch (loadError) {
        console.error(
          "Collector detail error:",
          loadError
        );

        setError(
          "Unable to load collector details from FastAPI."
        );
      } finally {
        setLoading(false);
      }
    },
    [collectorId]
  );

  useEffect(
    () => {
      loadDetail();

      const intervalId = setInterval(
        loadDetail,
        20000
      );

      return () =>
        clearInterval(intervalId);
    },
    [loadDetail]
  );

  if (loading) {
    return (
      <div className="collector-detail-page">
        <div className="collector-detail-loading">
          Loading collector details...
        </div>
      </div>
    );
  }

  if (error || !data?.collector) {
    return (
      <div className="collector-detail-page">
        <button
          type="button"
          className="collector-detail-back"
          onClick={() =>
            navigate("/dashboard/collectors")
          }
        >
          <ArrowLeft size={17} />
          All collectors
        </button>

        <div className="collector-detail-error">
          {error || "Collector was not found."}
        </div>
      </div>
    );
  }

  const collector = data.collector;
  const vehicle = data.vehicle;

  const stats = data.stats || {
    active_tasks: 0,
    completed_tasks: 0,
  };

  const assignments = Array.isArray(
    data.assignments
  )
    ? data.assignments
    : [];

  const status = normalizeStatus(
    collector.status
  );

  const operatingArea =
    collector.locality_name ||
    localityName ||
    collector.district_name ||
    districtName ||
    "Operating area";

  return (
    <div className="collector-detail-page">

      <button
        type="button"
        className="collector-detail-back"
        onClick={() =>
          navigate("/dashboard/collectors")
        }
      >
        <ArrowLeft size={17} />
        All collectors
      </button>

      <section className="collector-detail-heading">
        <div>

          <span className="collector-detail-code">
            {collector.collector_code}
          </span>

          <h1>
            {collector.collector_name}
          </h1>

          <p>
            {collector.email ||
              "Field operator profile"}
            {" · "}
            {operatingArea}
          </p>

        </div>

        <span
          className={`collector-detail-status ${status
            .toLowerCase()
            .replaceAll(" ", "-")}`}
        >
          {status}
        </span>
      </section>

      <div className="collector-detail-grid">

        <section className="collector-profile-card">

          <div className="collector-detail-avatar">
            {getInitials(
              collector.collector_name
            )}
          </div>

          <div className="collector-profile-label">
            CURRENT VEHICLE
          </div>

          <h2>
            {vehicle?.vehicle_number ||
              "No vehicle assigned"}
          </h2>

          <p className="collector-profile-subtitle">
            {vehicle?.vehicle_type ||
              "Vehicle assignment"}
          </p>

          <div className="collector-detail-stats">

            <div>
              <span>
                Active tasks
              </span>

              <strong>
                {Number(
                  stats.active_tasks
                ) || 0}
              </strong>
            </div>

            <div>
              <span>
                Completed
              </span>

              <strong>
                {Number(
                  stats.completed_tasks
                ) || 0}
              </strong>
            </div>

          </div>

          <div className="collector-contact-list">

            {collector.email && (
              <div>
                <Mail size={15} />
                <span>
                  {collector.email}
                </span>
              </div>
            )}

            <div>
              <MapPin size={15} />
              <span>
                {operatingArea}
              </span>
            </div>

            <div>
              <User size={15} />
              <span>
                Field collector
              </span>
            </div>

          </div>

        </section>

        <section className="collector-assignment-card">

          <div className="collector-assignment-header">

            <div>
              <h2>
                Assignment history
              </h2>

              <p>
                Recent collection work assigned to this collector.
              </p>
            </div>

            <ClipboardList size={21} />

          </div>

          {assignments.length === 0 ? (
            <div className="collector-no-assignments">
              <ClipboardList size={25} />

              <strong>
                No collection history
              </strong>

              <span>
                This collector has no recorded requests yet.
              </span>
            </div>
          ) : (
            <div className="collector-assignment-list">

              {assignments.map(
                (item, index) => (
                  <div
                    className="collector-assignment-row"
                    key={
                      item.request_id ||
                      `${collector.collector_id}-${index}`
                    }
                  >

                    <div className="collector-assignment-icon">
                      <Truck size={17} />
                    </div>

                    <div className="collector-assignment-main">

                      <strong>
                        {item.request_id}
                        {" · "}
                        {item.location}
                      </strong>

                      <span>
                        {item.bin_code}
                        {" · "}
                        {formatDate(
                          item.requested_at ||
                          item.assigned_at ||
                          item.completed_at
                        )}
                      </span>

                    </div>

                    <span
                      className={`collector-assignment-status ${String(
                        item.status ||
                        "Pending"
                      )
                        .toLowerCase()
                        .replaceAll(" ", "-")}`}
                    >
                      {item.status ||
                        "Pending"}
                    </span>

                  </div>
                )
              )}

            </div>
          )}

        </section>

      </div>
    </div>
  );
}

export default CollectorDetail;
