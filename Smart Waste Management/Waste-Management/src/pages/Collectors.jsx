import {
  Eye,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import "../styles/Collectors.css";

const API_BASE_URL = "http://localhost:8000";

function normalizeStatus(status) {
  const value = String(status || "Available").toLowerCase();

  if (
    value === "assigned" ||
    value === "busy" ||
    value === "in progress"
  ) {
    return "Busy";
  }

  if (
    value === "inactive" ||
    value === "offline"
  ) {
    return "Offline";
  }

  return "Available";
}

function statusClass(status) {
  return normalizeStatus(status)
    .toLowerCase()
    .replaceAll(" ", "-");
}

function getInitials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "C";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

function Collectors() {
  const navigate = useNavigate();

  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();

  const effectiveDistrictId =
    districtId ||
    localStorage.getItem("swmDistrictId") ||
    (() => {
      try {
        const saved =
          localStorage.getItem("swmUser");

        if (!saved) return "";

        const user =
          JSON.parse(saved);

        return user.districtId || "";
      } catch {
        return "";
      }
    })();

  const effectiveDistrictName =
    districtName ||
    localStorage.getItem("swmDistrictName") ||
    "Selected district";

  const [collectors, setCollectors] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saveMessage, setSaveMessage] =
    useState("");

  const [form, setForm] =
    useState({
      name: "",
      email: "",
      status: "Available",
    });

  // =====================================================
  // LOAD COLLECTORS FROM FASTAPI
  // =====================================================

  const loadCollectors = useCallback(
    async (manualRefresh = false) => {
      if (!effectiveDistrictId) {
        setCollectors([]);
        setLoading(false);

        setError(
          "No district is selected."
        );

        return;
      }

      try {
        setError("");

        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const params =
          new URLSearchParams();

        params.set(
          "district_id",
          String(effectiveDistrictId)
        );

        const response =
          await fetch(
            `${API_BASE_URL}/api/collectors?${params.toString()}&_=${Date.now()}`,
            {
              cache: "no-store",
            }
          );

        if (!response.ok) {
          throw new Error(
            `Collectors API returned ${response.status}`
          );
        }

        const result =
          await response.json();

        if (result.status !== "OK") {
          throw new Error(
            result.message ||
            "Unable to load collectors"
          );
        }

        setCollectors(
          Array.isArray(result.data)
            ? result.data
            : []
        );

      } catch (loadError) {
        console.error(
          "Collectors load error:",
          loadError
        );

        setError(
          "Unable to load collectors from FastAPI."
        );

      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [effectiveDistrictId]
  );

  // =====================================================
  // AUTO REFRESH
  // =====================================================

  useEffect(() => {
    loadCollectors();

    const intervalId =
      setInterval(
        () => loadCollectors(),
        20000
      );

    return () =>
      clearInterval(intervalId);
  }, [loadCollectors]);

  // =====================================================
  // SEARCH
  // =====================================================

  const filteredCollectors =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return collectors;
      }

      return collectors.filter(
        (collector) =>
          [
            collector.collector_name,
            collector.email,
            collector.locality_name,
            collector.district_name,
            collector.status,
            collector.collector_code,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
      );
    }, [collectors, search]);

  // =====================================================
  // COUNTS
  // =====================================================

  const total =
    collectors.length;

  const available =
    collectors.filter(
      (collector) =>
        normalizeStatus(
          collector.status
        ) === "Available"
    ).length;

  const busy =
    collectors.filter(
      (collector) =>
        normalizeStatus(
          collector.status
        ) === "Busy"
    ).length;

  // =====================================================
  // ADD COLLECTOR
  // =====================================================

  const openAddModal = () => {
    setSaveMessage("");

    setForm({
      name: "",
      email: "",
      status: "Available",
    });

    setModalOpen(true);
  };

  const closeAddModal = () => {
    if (saving) return;

    setModalOpen(false);
    setSaveMessage("");
  };

  const handleFormChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (previous) => ({
        ...previous,
        [name]: value,
      })
    );
  };

  const handleSaveCollector =
    async (event) => {
      event.preventDefault();

      if (!effectiveDistrictId) {
        setSaveMessage(
          "Please select a district first."
        );

        return;
      }

      if (!form.name.trim()) {
        setSaveMessage(
          "Please enter the collector name."
        );

        return;
      }

      if (!form.email.trim()) {
        setSaveMessage(
          "Please enter the collector email."
        );

        return;
      }

      try {
        setSaving(true);
        setSaveMessage("");

        const response =
          await fetch(
            `${API_BASE_URL}/api/collectors`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                collector_name:
                  form.name.trim(),

                email:
                  form.email.trim(),

                status:
                  form.status,

                district_id:
                  Number(
                    effectiveDistrictId
                  ),

                locality_id:
                  localityId
                    ? Number(localityId)
                    : null,
              }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          result.status !== "OK"
        ) {
          throw new Error(
            result.message ||
            "Unable to create collector"
          );
        }

        setModalOpen(false);

        setForm({
          name: "",
          email: "",
          status: "Available",
        });

        await loadCollectors(true);

      } catch (saveError) {
        console.error(
          "Create collector error:",
          saveError
        );

        setSaveMessage(
          saveError.message ||
          "Unable to create collector."
        );

      } finally {
        setSaving(false);
      }
    };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="collectors-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="collectors-header">

        <div>

          <span className="collectors-eyebrow">
            FIELD OPERATIONS
          </span>

          <h1>
            Collectors
          </h1>

          <p>
            Keep the field team, availability,
            and current workload visible to dispatch.
          </p>

        </div>

        <button
          type="button"
          className="collector-add-button"
          onClick={openAddModal}
        >
          <UserPlus size={18} />
          Add collector
        </button>

      </header>


      {/* =================================================
          SEARCH / TOP BAR
      ================================================= */}

      <div className="collectors-toolbar">

        <div className="collectors-search">

          <Search size={18} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search collectors"
          />

        </div>


        <div className="collectors-toolbar-right">

          <span className="collector-count">
            {total} collectors
          </span>

          <span className="collector-location">
            {localityName ||
              districtName ||
              effectiveDistrictName}
          </span>

          <button
            type="button"
            className="collector-refresh"
            onClick={() =>
              loadCollectors(true)
            }
            disabled={refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>

        </div>

      </div>


      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="collectors-error">
          {error}
        </div>
      )}


      {/* =================================================
          LIVE STRIP
      ================================================= */}

      <div className="collectors-live-strip">

        <span className="collector-live-dot" />

        <strong>
          Live collector directory
        </strong>

        <span>
          Updates automatically every 20 seconds.
        </span>

        <span className="collector-live-stats">
          {available} Available · {busy} Busy
        </span>

      </div>


      {/* =================================================
          LOADING
      ================================================= */}

      {loading ? (

        <div className="collectors-empty">

          <Users size={28} />

          Loading collectors from FastAPI...

        </div>

      ) : filteredCollectors.length === 0 ? (

        <div className="collectors-empty">

          <Users size={30} />

          <strong>
            {collectors.length === 0
              ? "No collectors registered"
              : "No matching collectors"}
          </strong>

          <span>
            {collectors.length === 0
              ? "FastAPI did not return any collector records."
              : "Try another collector name."}
          </span>

          {collectors.length === 0 && (
            <button
              type="button"
              className="collector-empty-action"
              onClick={openAddModal}
            >
              <UserPlus size={16} />
              Add collector
            </button>
          )}

        </div>

      ) : (

        /* =================================================
           COLLECTOR GRID
        ================================================= */

        <section className="collectors-grid">

          {filteredCollectors.map(
            (collector) => {

              const currentStatus =
                normalizeStatus(
                  collector.status
                );

              const activeTasks =
                Number(
                  collector.active_tasks
                ) || 0;

              return (

                <article
                  className="collector-card"
                  key={
                    collector.collector_id
                  }
                >

                  {/* ===============================
                      TOP
                  =============================== */}

                  <div className="collector-card-top">

                    <div className="collector-person">

                      <div className="collector-avatar">
                        {getInitials(
                          collector.collector_name
                        )}
                      </div>

                      <div className="collector-name-block">

                        <strong>
                          {collector.collector_name}
                        </strong>

                        <span>
                          {collector.collector_code ||
                            `COL-${String(
                              collector.collector_id
                            ).padStart(3, "0")}`}
                        </span>

                      </div>

                    </div>


                    <span
                      className={
                        `collector-status ${statusClass(
                          currentStatus
                        )}`
                      }
                    >
                      {currentStatus}
                    </span>

                  </div>


                  {/* ===============================
                      ACTIVE TASKS ONLY
                  =============================== */}

                  <div className="collector-card-stats">

                    <div>

                      <span>
                        Active tasks
                      </span>

                      <strong>
                        {activeTasks}
                      </strong>

                    </div>

                  </div>


                  {/* ===============================
                      FOOTER
                  =============================== */}

                  <div className="collector-card-footer">

                    <span className="collector-email">
                      {collector.email ||
                        "No email"}
                    </span>

                    <div className="collector-actions">

                      <button
                        type="button"
                        title="View collector"
                        onClick={() =>
                          navigate(
                            `/dashboard/collectors/${collector.collector_id}`
                          )
                        }
                      >
                        <Eye size={18} />
                      </button>


                      <button
                        type="button"
                        title="Edit collector"
                        onClick={() =>
                          alert(
                            "Edit collector can be connected to the update API."
                          )
                        }
                      >
                        <Pencil size={18} />
                      </button>


                      <button
                        type="button"
                        title="Delete collector"
                        onClick={() =>
                          alert(
                            "Delete collector can be connected to the delete API."
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>

                    </div>

                  </div>

                </article>

              );

            }
          )}

        </section>

      )}


      {/* =================================================
          ADD COLLECTOR MODAL
      ================================================= */}

      {modalOpen && (

        <div
          className="collector-modal-overlay"
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              closeAddModal();
            }

          }}
        >

          <div className="collector-modal">

            <div className="collector-modal-header">

              <div>

                <h2>
                  Add collector
                </h2>

                <p>
                  Add a real collector to
                  the selected operating area.
                </p>

              </div>

              <button
                type="button"
                onClick={closeAddModal}
                disabled={saving}
              >
                <X size={20} />
              </button>

            </div>


            <form
              onSubmit={
                handleSaveCollector
              }
            >

              <label>

                Full name

                <input
                  name="name"
                  value={form.name}
                  onChange={
                    handleFormChange
                  }
                  placeholder="Collector name"
                  autoComplete="off"
                />

              </label>


              <label>

                Email

                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={
                    handleFormChange
                  }
                  placeholder="collector@example.com"
                  autoComplete="off"
                />

              </label>


              <label>

                Status

                <select
                  name="status"
                  value={form.status}
                  onChange={
                    handleFormChange
                  }
                >

                  <option>
                    Available
                  </option>

                  <option>
                    Assigned
                  </option>

                  <option>
                    Inactive
                  </option>

                </select>

              </label>


              <div className="collector-modal-location">

                <span>
                  District
                </span>

                <strong>
                  {districtName ||
                    effectiveDistrictName}
                </strong>

                <span>
                  Locality
                </span>

                <strong>
                  {localityName ||
                    "All localities in district"}
                </strong>

              </div>


              {saveMessage && (

                <div className="collector-save-message">
                  {saveMessage}
                </div>

              )}


              <div className="collector-modal-actions">

                <button
                  type="button"
                  className="collector-cancel"
                  onClick={
                    closeAddModal
                  }
                  disabled={saving}
                >
                  Cancel
                </button>


                <button
                  type="submit"
                  className="collector-save"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Save collector"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}

export default Collectors;