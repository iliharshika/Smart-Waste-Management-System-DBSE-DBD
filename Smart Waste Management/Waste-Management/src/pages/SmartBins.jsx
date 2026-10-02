import {
  Eye,
  Filter,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useOutletContext,
  useNavigate,
} from "react-router-dom";

import "../styles/SmartBins.css";


const API_BASE_URL = "http://localhost:8000";


const EMPTY_DATA = {
  bins: [],
};


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


function SmartBins() {

  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();

  const navigate = useNavigate();


  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [lastUpdated, setLastUpdated] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    location: "",
    capacity: "660",
    level: "0",
  });


  const loadBins = useCallback(
    async (forceRefresh = false) => {

      if (!districtId) {
        setData(EMPTY_DATA);
        setLoading(false);
        return;
      }

      try {
        setError("");

        if (forceRefresh) {
          setRefreshing(true);
        } else if (data.bins.length === 0) {
          setLoading(true);
        }

        const params = new URLSearchParams();
        params.set("district_id", String(districtId));

        if (localityId) {
          params.set("locality_id", String(localityId));
        }

        if (forceRefresh) {
          params.set("force", "true");
        }

        const response = await fetch(
          `${API_BASE_URL}/api/overview-live?${params.toString()}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`FastAPI returned ${response.status}`);
        }

        const result = await response.json();

        if (result.status !== "OK") {
          throw new Error(
            result.message || "Unable to load live bins"
          );
        }

        setData({
          bins: Array.isArray(result.liveBins)
            ? result.liveBins
            : [],
        });

        setLastUpdated(
          result.simulation_second || result.updated_at || ""
        );
      } catch (requestError) {
        console.error("Smart bins error:", requestError);
        setError("Unable to load live smart-bin data from FastAPI.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [districtId, localityId, data.bins.length]
  );


  useEffect(() => {
    loadBins();

    const intervalId = setInterval(
      () => loadBins(),
      20000
    );

    return () => clearInterval(intervalId);
  }, [loadBins]);


  const filteredBins = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...data.bins]
      .filter((bin) => {
        if (filter === "All") return true;
        return bin.status === filter;
      })
      .filter((bin) => {
        if (!query) return true;

        return [
          bin.bin_code,
          bin.location,
          bin.status,
          bin.capacity,
          bin.waste_level,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(
        (a, b) =>
          Number(b.waste_level || 0) -
          Number(a.waste_level || 0)
      );
  }, [data.bins, filter, search]);


  const counts = useMemo(() => {
    const bins = data.bins;

    return {
      total: bins.length,
      critical: bins.filter(
        (bin) => bin.status === "Critical"
      ).length,
      warning: bins.filter(
        (bin) => bin.status === "Warning"
      ).length,
      normal: bins.filter(
        (bin) => bin.status === "Normal"
      ).length,
    };
  }, [data.bins]);


  const selectedLocation =
    localityName || districtName || "All locations";


  const openAddModal = () => {
    setFormError("");
    setForm({
      location: "",
      capacity: "660",
      level: "0",
    });
    setModalOpen(true);
  };


  const closeAddModal = () => {
    if (!saving) {
      setModalOpen(false);
    }
  };


  const handleSaveBin = async (event) => {
    event.preventDefault();

    if (!localityId) {
      setFormError(
        "Select a locality from the top location selector before adding a bin."
      );
      return;
    }

    const capacity = Number(form.capacity);
    const level = Number(form.level);

    if (!form.location.trim()) {
      setFormError("Enter the bin location.");
      return;
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
      setFormError("Capacity must be greater than 0.");
      return;
    }

    if (!Number.isFinite(level) || level < 0 || level > 100) {
      setFormError("Current level must be between 0 and 100.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");

      const response = await fetch(
        `${API_BASE_URL}/api/bins/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            district_id: districtId,
            locality_id: localityId,
            location_description: form.location.trim(),
            capacity,
            current_level: level,
            threshold: 80,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.status !== "OK") {
        throw new Error(
          result.message || "Unable to create smart bin"
        );
      }

      setModalOpen(false);

      // Force a new shared snapshot so Overview,
      // Monitoring and Collections can see the new bin.
      await loadBins(true);
    } catch (requestError) {
      console.error("Create smart bin error:", requestError);
      setFormError(
        requestError.message || "Unable to create smart bin."
      );
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="smart-bins-page">

      <header className="smart-bins-header">
        <div>
          <div className="smart-bins-eyebrow">RESOURCE REGISTRY</div>
          <h1>Smart bins</h1>
          <p>
            Track every live bin, its current fill level, and the zones that need a round next.
          </p>
        </div>

        <button
          className="smart-bins-add-button"
          type="button"
          onClick={openAddModal}
        >
          <Plus size={18} />
          Add smart bin
        </button>
      </header>


      {error && (
        <div className="smart-bins-error">
          {error}
        </div>
      )}


      <section className="smart-bins-toolbar">
        <div className="smart-bins-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bins or locations"
          />
        </div>

        <div className="smart-bins-filter-wrap">
          <Filter size={16} />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="All">All</option>
            <option value="Normal">Normal</option>
            <option value="Warning">Warning</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        <span className="smart-bins-count">
          {loading ? "—" : `${counts.total} bins`}
        </span>
      </section>


      <section className="smart-bins-live-banner">
        <div>
          <span className="smart-live-dot" />
          <strong>Live bin levels</strong>
          <span>update automatically every 20 seconds.</span>
        </div>

        <div className="smart-bins-live-right">
          <span>
            Normal {counts.normal}
          </span>
          <span>
            Warning {counts.warning}
          </span>
          <span>
            Critical {counts.critical}
          </span>
          <span>
            Last sync {formatTime(lastUpdated)}
          </span>
          <button
            type="button"
            onClick={() => loadBins(true)}
            disabled={refreshing}
            className="smart-bins-refresh"
            title="Refresh live bins"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </section>


      <section className="smart-bins-table-card">
        <div className="smart-bins-table-wrap">
          {loading ? (
            <div className="smart-bins-empty">
              <RefreshCw size={22} />
              Loading live smart bins...
            </div>
          ) : filteredBins.length === 0 ? (
            <div className="smart-bins-empty">
              <Package size={28} />
              <strong>No bins match this filter</strong>
              <span>
                Try another status or search term.
              </span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>BIN / LOCATION</th>
                  <th>FILL LEVEL</th>
                  <th>CAPACITY</th>
                  <th>LAST UPDATED</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredBins.map((bin) => {
                  const level = Number(bin.waste_level || 0);

                  return (
                    <tr key={`${bin.bin_id}-${bin.bin_code}`}>
                      <td>
                        <div className="smart-bin-location-cell">
                          <strong>{bin.location}</strong>
                          <span>{bin.bin_code}</span>
                        </div>
                      </td>

                      <td>
                        <div className="smart-bin-level-cell">
                          <strong>{level}%</strong>
                          <div className="smart-bin-progress">
                            <div
                              className={statusClass(bin.status)}
                              style={{
                                width: `${Math.min(100, Math.max(0, level))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong className="smart-bin-capacity">
                          {bin.capacity} L
                        </strong>
                      </td>

                      <td>
                        <span className="smart-bin-updated">
                          {formatTime(lastUpdated)}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`smart-bin-status ${statusClass(bin.status)}`}
                        >
                          {bin.status === "Warning"
                            ? "Near Full"
                            : bin.status}
                        </span>
                      </td>

                      <td>
                        <button
                          className="smart-bin-view-button"
                          type="button"
                          title={`View ${bin.bin_code}`}
                          onClick={() =>
                            navigate(
                              `/dashboard/smart-bins/${encodeURIComponent(
                                bin.bin_code
                              )}`
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>


      <div className="smart-bins-footer">
        <div>
          <MapPin size={14} />
          <span>{selectedLocation}</span>
        </div>
        <span>
          Live state synchronized with Overview, Monitoring and Collections.
        </span>
      </div>


      {modalOpen && (
        <div
          className="smart-bin-modal-overlay"
          onMouseDown={closeAddModal}
        >
          <div
            className="smart-bin-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="smart-bin-modal-header">
              <div>
                <h2>Add smart bin</h2>
                <p>Register a new persistent bin for the selected locality.</p>
              </div>

              <button
                type="button"
                className="smart-bin-modal-close"
                onClick={closeAddModal}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSaveBin}>
              <label>
                Campus location
                <input
                  value={selectedLocation}
                  readOnly
                />
              </label>

              <label>
                Location
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      location: event.target.value,
                    })
                  }
                  placeholder="e.g. Main Block"
                  autoFocus
                />
              </label>

              <div className="smart-bin-form-grid">
                <label>
                  Capacity (liters)
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        capacity: event.target.value,
                      })
                    }
                    placeholder="660"
                  />
                </label>

                <label>
                  Current level (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.level}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        level: event.target.value,
                      })
                    }
                    placeholder="0"
                  />
                </label>
              </div>

              {formError && (
                <div className="smart-bin-form-error">
                  {formError}
                </div>
              )}

              <div className="smart-bin-modal-actions">
                <button
                  type="button"
                  className="smart-bin-cancel"
                  onClick={closeAddModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="smart-bin-save"
                  disabled={saving}
                >
                  <Plus size={16} />
                  {saving ? "Saving..." : "Save bin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}


export default SmartBins;
