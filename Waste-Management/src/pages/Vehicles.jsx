import {
  CheckCircle2,
  MoreHorizontal,
  Plus,
  Search,
  Truck,
  Wrench,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useOutletContext } from "react-router-dom";

import "../styles/Vehicles.css";

const API_BASE_URL = "http://localhost:8000";

function normalizeStatus(status) {
  const value = String(status || "Available").toLowerCase();

  if (value === "maintenance") return "Maintenance";
  if (value === "assigned" || value === "busy") return "Assigned";
  if (value === "offline" || value === "inactive") return "Offline";

  return "Available";
}

function Vehicles() {
  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();

  const [vehicles, setVehicles] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [form, setForm] = useState({
    vehicle_number: "",
    vehicle_type: "Waste Collection Truck",
    capacity: "",
    status: "Available",
    collector_id: "",
  });

  const locationText =
    localityName ||
    districtName ||
    "Selected area";

  const loadVehicles = useCallback(
    async (manual = false) => {
      if (!districtId) {
        setVehicles([]);
        setLoading(false);
        return;
      }

      try {
        setError("");

        if (manual) {
          setRefreshing(true);
        }

        const params = new URLSearchParams();
        params.set("district_id", String(districtId));

        if (localityId) {
          params.set("locality_id", String(localityId));
        }

        // Force a fresh request for the manual Refresh button.
        if (manual) {
          params.set("_refresh", String(Date.now()));
        }

        const response = await fetch(
          `${API_BASE_URL}/api/vehicles?${params.toString()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );

        const result = await response.json();

        if (!response.ok || result.status !== "OK") {
          throw new Error(
            result.message || `FastAPI returned ${response.status}`
          );
        }

        setVehicles(
          Array.isArray(result.data)
            ? result.data
            : []
        );

        setLastUpdated(
          result.refreshed_at ||
          new Date().toLocaleTimeString("en-IN")
        );
      } catch (loadError) {
        console.error("Vehicles load error:", loadError);
        setError(
          "Unable to load vehicles from FastAPI."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [districtId, localityId]
  );

  const loadCollectors = useCallback(async () => {
    if (!districtId) {
      setCollectors([]);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("district_id", String(districtId));

      if (localityId) {
        params.set("locality_id", String(localityId));
      }

      const response = await fetch(
        `${API_BASE_URL}/api/collectors?${params.toString()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        setCollectors([]);
        return;
      }

      const result = await response.json();

      setCollectors(
        Array.isArray(result.data)
          ? result.data
          : []
      );
    } catch (loadError) {
      console.error("Collector load error:", loadError);
      setCollectors([]);
    }
  }, [districtId, localityId]);

  useEffect(() => {
    loadVehicles();

    const intervalId = setInterval(
      () => loadVehicles(),
      20000
    );

    return () => clearInterval(intervalId);
  }, [loadVehicles]);

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return vehicles;
    }

    return vehicles.filter((vehicle) =>
      [
        vehicle.vehicle_number,
        vehicle.vehicle_type,
        vehicle.collector_name,
        vehicle.status,
        vehicle.district_name,
        vehicle.locality_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [vehicles, search]);

  const availableCount = vehicles.filter(
    (vehicle) =>
      normalizeStatus(vehicle.status) === "Available"
  ).length;

  const assignedCount = vehicles.filter(
    (vehicle) =>
      normalizeStatus(vehicle.status) === "Assigned"
  ).length;

  const maintenanceCount = vehicles.filter(
    (vehicle) =>
      normalizeStatus(vehicle.status) === "Maintenance"
  ).length;

  const openAddModal = () => {
    setSaveMessage("");

    setForm({
      vehicle_number: "",
      vehicle_type: "Waste Collection Truck",
      capacity: "",
      status: "Available",
      collector_id: "",
    });

    loadCollectors();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setSaveMessage("");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!districtId) {
      setSaveMessage("Please select a district first.");
      return;
    }

    if (!form.vehicle_number.trim()) {
      setSaveMessage("Please enter the vehicle number.");
      return;
    }

    if (!form.capacity) {
      setSaveMessage("Please enter the capacity.");
      return;
    }

    try {
      setSaving(true);
      setSaveMessage("");

      const response = await fetch(
        `${API_BASE_URL}/api/vehicles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vehicle_number: form.vehicle_number.trim(),
            vehicle_type: form.vehicle_type,
            capacity: Number(form.capacity),
            status: form.status,
            collector_id: form.collector_id
              ? Number(form.collector_id)
              : null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.status !== "OK") {
        throw new Error(
          result.message || "Unable to add vehicle."
        );
      }

      setModalOpen(false);
      await loadVehicles(true);
    } catch (saveError) {
      console.error("Add vehicle error:", saveError);
      setSaveMessage(
        saveError.message || "Unable to add vehicle."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vehicles-page">
      <div className="vehicles-header">
        <div>
          <span className="vehicles-eyebrow">
            RESOURCES
          </span>

          <h1>Vehicles</h1>

          <p>
            Manage collection vehicles and their current
            availability.
          </p>
        </div>

        <button
          type="button"
          className="vehicle-add-button"
          onClick={openAddModal}
        >
          <Plus size={17} />
          Add vehicle
        </button>
      </div>

      <div className="vehicles-toolbar">
        <div className="vehicles-search">
          <Search size={18} />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vehicles or collectors"
          />
        </div>

        <div className="vehicles-toolbar-right">
          <strong>{vehicles.length} vehicles</strong>
          <span>{locationText}</span>

          <button
            type="button"
            className="vehicle-refresh"
            onClick={() => loadVehicles(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="vehicles-error">
          {error}
        </div>
      )}

      <div className="vehicles-live-strip">
        <span className="vehicle-live-dot" />

        <strong>
          Live vehicle directory
        </strong>

        <span>
          Updates automatically every 20 seconds.
        </span>

        {lastUpdated && (
          <span className="vehicle-last-updated">
            Last sync: {lastUpdated}
          </span>
        )}

        <span className="vehicle-live-stats">
          {availableCount} Available · {assignedCount} Assigned ·{" "}
          {maintenanceCount} Maintenance
        </span>
      </div>

      {loading ? (
        <div className="vehicles-empty">
          Loading vehicles from MySQL...
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="vehicles-empty">
          <Truck size={34} />

          <strong>
            No vehicles registered here
          </strong>

          <span>
            No vehicle records were found for {locationText}.
          </span>
        </div>
      ) : (
        <div className="vehicles-grid">
          {filteredVehicles.map((vehicle) => {
            const status = normalizeStatus(vehicle.status);

            return (
              <div
                className="vehicle-card"
                key={vehicle.vehicle_id}
              >
                <div className="vehicle-card-top">
                  <div className="vehicle-icon">
                    <Truck size={21} />
                  </div>

                  <button
                    type="button"
                    className="vehicle-more"
                    title="Vehicle options"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>

                <strong className="vehicle-number">
                  {vehicle.vehicle_number}
                </strong>

                <span className="vehicle-type">
                  {vehicle.vehicle_type}
                </span>

                <div className="vehicle-info">
                  <div>
                    <span>Capacity</span>
                    <strong>
                      {Number(vehicle.capacity || 0)} kg
                    </strong>
                  </div>

                  <div>
                    <span>Collector</span>
                    <strong>
                      {vehicle.collector_name || "Unassigned"}
                    </strong>
                  </div>
                </div>

                <div className="vehicle-area">
                  {vehicle.locality_name ||
                    vehicle.district_name ||
                    locationText}
                </div>

                <div className="vehicle-footer">
                  <span
                    className={`vehicle-status ${status
                      .toLowerCase()
                      .replaceAll(" ", "-")}`}
                  >
                    {status === "Maintenance" ? (
                      <Wrench size={13} />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}

                    {status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div
          className="vehicle-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="vehicle-modal">
            <div className="vehicle-modal-header">
              <div>
                <span className="vehicles-eyebrow">
                  RESOURCES
                </span>

                <h2>Add vehicle</h2>

                <p>
                  Add a real vehicle and connect it to a
                  collector.
                </p>
              </div>

              <button
                type="button"
                className="vehicle-modal-close"
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="vehicle-modal-form"
              onSubmit={handleSave}
            >
              <label>
                Vehicle number
                <input
                  name="vehicle_number"
                  value={form.vehicle_number}
                  onChange={handleChange}
                  placeholder="TS09AB1006"
                />
              </label>

              <label>
                Vehicle type
                <select
                  name="vehicle_type"
                  value={form.vehicle_type}
                  onChange={handleChange}
                >
                  <option>Waste Collection Truck</option>
                  <option>Mini Tipper</option>
                </select>
              </label>

              <label>
                Capacity (kg)
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={handleChange}
                  placeholder="5000"
                />
              </label>

              <label>
                Status
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                >
                  <option>Available</option>
                  <option>Assigned</option>
                  <option>Maintenance</option>
                  <option>Offline</option>
                </select>
              </label>

              <label>
                Collector
                <select
                  name="collector_id"
                  value={form.collector_id}
                  onChange={handleChange}
                >
                  <option value="">
                    Unassigned
                  </option>

                  {collectors.map((collector) => (
                    <option
                      key={collector.collector_id}
                      value={collector.collector_id}
                    >
                      {collector.collector_name}
                    </option>
                  ))}
                </select>
              </label>

              {saveMessage && (
                <div className="vehicle-save-message">
                  {saveMessage}
                </div>
              )}

              <div className="vehicle-modal-footer">
                <button
                  type="button"
                  className="vehicle-cancel"
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="vehicle-save"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Vehicles;
