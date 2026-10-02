import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createPortal } from "react-dom";

import {
  useOutletContext,
} from "react-router-dom";

import "../styles/Collections.css";


const API_BASE_URL =
  "http://localhost:8000";


const EMPTY_DATA = {
  summary: {
    totalBins: 0,
    pending: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
  },
  requests: [],
  bins: [],
};


function statusClass(status) {
  return String(status || "Pending")
    .toLowerCase()
    .replaceAll(" ", "-");
}


function priorityScore(status) {
  const value = String(status || "").toLowerCase();

  if (value === "critical") return 3;
  if (value === "warning") return 2;

  return 1;
}


function Collections() {

  const {
    districtId,
    districtName,
    localityId,
    localityName,
  } = useOutletContext();


  const [liveData, setLiveData] =
    useState(EMPTY_DATA);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [lastUpdated, setLastUpdated] =
    useState("");

  /* New Request modal */
  const [newRequestOpen, setNewRequestOpen] =
    useState(false);

  const [selectedBinCode, setSelectedBinCode] =
    useState("");

  const [createMessage, setCreateMessage] =
    useState("");


  const loadCollections = useCallback(
    async (forceRefresh = false) => {

      if (!districtId) {
        setLiveData(EMPTY_DATA);
        setLoading(false);
        return;
      }

      try {
        setError("");

        if (forceRefresh) {
          setRefreshing(true);
        } else if (liveData.requests.length === 0) {
          setLoading(true);
        }

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

        if (forceRefresh) {
          params.set("force", "true");
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
            "Unable to load collection data"
          );
        }

        const bins = Array.isArray(result.liveBins)
          ? result.liveBins
          : [];

        const requests = Array.isArray(result.recentRequests)
          ? result.recentRequests
          : [];

        const pending = requests.filter(
          (request) => request.status === "Pending"
        ).length;

        const assigned = requests.filter(
          (request) => request.status === "Assigned"
        ).length;

        const inProgress = requests.filter(
          (request) => request.status === "In Progress"
        ).length;

        const completed = requests.filter(
          (request) => request.status === "Completed"
        ).length;

        setLiveData({
          summary: {
            totalBins: bins.length,
            pending,
            assigned,
            inProgress,
            completed,
          },
          requests,
          bins,
        });

        setLastUpdated(
          result.simulation_second ||
          result.updated_at ||
          ""
        );

        setCreateMessage("");

      } catch (requestError) {
        console.error(
          "Collections live data error:",
          requestError
        );

        setError(
          "Unable to load live collection data from FastAPI."
        );

      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      districtId,
      localityId,
      liveData.requests.length,
    ]
  );


  useEffect(() => {
    loadCollections();

    const intervalId = setInterval(
      () => loadCollections(),
      20000
    );

    return () => clearInterval(intervalId);
  }, [loadCollections]);


  const binLookup = useMemo(() => {
    const lookup = {};

    liveData.bins.forEach((bin) => {
      lookup[String(bin.bin_code)] = bin;
    });

    return lookup;
  }, [liveData.bins]);


  const enrichedRequests = useMemo(() => {
    return liveData.requests.map((request, index) => {
      const binCode =
        request.binCode ||
        request.bin_code ||
        "—";

      const liveBin =
        binLookup[String(binCode)];

      return {
        ...request,
        internalId:
          `${request.requestId || "REQ"}-${index}`,
        displayId:
          request.requestId ||
          request.request_id ||
          `REQ-SIM-${index + 1}`,
        bin: binCode,
        location:
          liveBin?.location ||
          request.location ||
          request.location_description ||
          "—",
        wasteLevel: Number(
          liveBin?.waste_level ??
          liveBin?.level ??
          0
        ),
        binStatus:
          liveBin?.status ||
          request.binStatus ||
          "Normal",
        priority:
          request.priority ||
          (liveBin?.status === "Critical"
            ? "Critical"
            : liveBin?.status === "Warning"
              ? "High"
              : "Medium"),
        collector:
          request.collector ||
          request.collectorName ||
          request.collector_name ||
          "Unassigned",
        vehicle:
          request.vehicle ||
          request.vehicleNumber ||
          request.vehicle_number ||
          "Unassigned",
        status:
          request.status ||
          "Pending",
        requestedAt:
          request.requestedAt ||
          request.requested_at ||
          null,
      };
    });
  }, [liveData.requests, binLookup]);


  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return enrichedRequests.filter((request) => {
      const matchesStatus =
        statusFilter === "All" ||
        request.status === statusFilter;

      if (!matchesStatus) return false;
      if (!query) return true;

      return [
        request.displayId,
        request.bin,
        request.location,
        request.collector,
        request.vehicle,
        request.status,
        request.priority,
        request.binStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    enrichedRequests,
    search,
    statusFilter,
  ]);


  /* =======================================================
     NEW REQUEST
  ======================================================= */

  const selectableBins = useMemo(() => {
    return [...liveData.bins].sort((a, b) => {
      const priorityDifference =
        priorityScore(b.status) -
        priorityScore(a.status);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (
        Number(b.waste_level ?? b.level ?? 0) -
        Number(a.waste_level ?? a.level ?? 0)
      );
    });
  }, [liveData.bins]);


  const openNewRequest = () => {
    const defaultBin = selectableBins[0];

    setSelectedBinCode(
      defaultBin?.bin_code || ""
    );

    setCreateMessage("");
    setNewRequestOpen(true);
  };


  const closeNewRequest = () => {
    setNewRequestOpen(false);
    setCreateMessage("");
  };


  const createNewRequest = () => {
    const selectedBin = selectableBins.find(
      (bin) =>
        String(bin.bin_code) ===
        String(selectedBinCode)
    );

    if (!selectedBin) {
      setCreateMessage(
        "Please select a live bin."
      );
      return;
    }

    const level = Number(
      selectedBin.waste_level ??
      selectedBin.level ??
      0
    );

    const status =
      selectedBin.status ||
      "Normal";

    const priority =
      status === "Critical"
        ? "Critical"
        : status === "Warning"
          ? "High"
          : "Medium";

    const newRequest = {
      requestId:
        `REQ-NEW-${String(Date.now()).slice(-6)}`,
      binCode:
        selectedBin.bin_code,
      location:
        selectedBin.location,
      priority,
      status: "Pending",
      requestedAt:
        new Date().toISOString(),
      binStatus: status,
      collector: "Unassigned",
      vehicle: "Unassigned",
    };

    setLiveData((previous) => ({
      ...previous,
      requests: [
        newRequest,
        ...previous.requests,
      ].slice(0, 8),
      summary: {
        ...previous.summary,
        pending:
          previous.summary.pending + 1,
      },
    }));

    setCreateMessage(
      `${selectedBin.bin_code} request created successfully.`
    );

    setTimeout(() => {
      setNewRequestOpen(false);
      setCreateMessage("");
    }, 900);
  };


  const locationText =
    localityName ||
    districtName ||
    "All locations";


  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
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
  };


  const getStatusIcon = (status) => {
    if (status === "Completed") {
      return <CheckCircle2 size={14} />;
    }

    if (status === "In Progress") {
      return <Clock3 size={14} />;
    }

    if (status === "Pending") {
      return <AlertTriangle size={14} />;
    }

    return <ClipboardList size={14} />;
  };


  return (
    <div className="collections-page">

      <header className="collections-header">
        <div className="collections-title">
          <div>
            <div className="collections-eyebrow">
              ROUTE PLANNING
            </div>

            <h1>Collections</h1>

            <p>
              Create, assign, and move collection requests
              through the live operations board.
            </p>
          </div>
        </div>

        <div className="collections-header-actions">
          <div className="collections-live">
            <span />
            LIVE
          </div>

          <button
            className="collection-primary"
            type="button"
            onClick={openNewRequest}
          >
            <Plus size={18} />
            Create request
          </button>
        </div>
      </header>


      {error && (
        <div className="collections-error">
          {error}
        </div>
      )}


      <div className="collections-location-strip">
        <div>
          <MapPin size={14} />
          <strong>{locationText}</strong>
        </div>

        <span>
          <span className="collections-status-dot" />
          FastAPI live data
        </span>

        <span>
          {lastUpdated
            ? `Updated ${lastUpdated}`
            : "Waiting for update"}
        </span>
      </div>


      <section className="collection-summary">
        <div>
          <span>OPEN</span>
          <strong>
            {loading
              ? "—"
              : enrichedRequests.filter(
                  (request) =>
                    request.status !== "Completed"
                ).length}
          </strong>
          <small>Needs a next action</small>
        </div>

        <div>
          <span>PENDING</span>
          <strong>
            {loading
              ? "—"
              : liveData.summary.pending}
          </strong>
          <small>Awaiting assignment</small>
        </div>

        <div>
          <span>IN PROGRESS</span>
          <strong>
            {loading
              ? "—"
              : liveData.summary.inProgress}
          </strong>
          <small>On a route now</small>
        </div>

        <div>
          <span>COMPLETED</span>
          <strong>
            {loading
              ? "—"
              : liveData.summary.completed}
          </strong>
          <small>Current live snapshot</small>
        </div>
      </section>


      <div className="collections-status-summary">
        <span>
          <Clock3 size={13} />
          {liveData.summary.inProgress} In Progress
        </span>

        <span className="critical-summary">
          <AlertTriangle size={13} />
          {
            enrichedRequests.filter(
              (request) =>
                request.binStatus === "Critical" ||
                request.priority === "Critical"
            ).length
          } Critical priority
        </span>

        <span>
          <Truck size={13} />
          {
            enrichedRequests.filter(
              (request) =>
                request.vehicle !== "Unassigned"
            ).length
          } Assigned vehicles
        </span>

        <button
          className="collections-refresh"
          type="button"
          onClick={() =>
            loadCollections(true)
          }
          disabled={refreshing}
        >
          <RefreshCw size={14} />
          {refreshing
            ? "Refreshing..."
            : "Refresh data"}
        </button>
      </div>


      <section className="collection-table-card">

        <div className="collection-toolbar">
          <div className="collection-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search request or location"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option>All</option>
            <option>Pending</option>
            <option>Assigned</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
        </div>

        <div className="collection-table-wrap">
          {loading ? (
            <div className="collections-empty">
              <RefreshCw size={22} />
              Loading live collection requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="collections-empty">
              <ClipboardList size={26} />
              <strong>No matching collection requests</strong>
              <span>
                The current live snapshot has no requests
                matching this filter.
              </span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>REQUEST</th>
                  <th>BIN / ZONE</th>
                  <th>PRIORITY</th>
                  <th>COLLECTOR</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.internalId}>
                    <td>
                      <strong className="collection-request-id">
                        {request.displayId}
                      </strong>
                      <small className="request-level-note">
                        {request.wasteLevel}% at creation/live level
                      </small>
                    </td>

                    <td>
                      <div className="bin-zone-cell">
                        <strong>{request.location}</strong>
                        <span>{request.bin}</span>
                        <em
                          className={`bin-live-status ${statusClass(
                            request.binStatus
                          )}`}
                        >
                          {request.binStatus}
                        </em>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`collection-priority ${String(
                          request.priority
                        )
                          .toLowerCase()
                          .replaceAll(" ", "-")}`}
                      >
                        {request.priority}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          request.collector === "Unassigned"
                            ? "resource-unassigned"
                            : "resource-assigned"
                        }
                      >
                        {request.collector}
                      </span>
                    </td>

                    <td>{formatDate(request.requestedAt)}</td>

                    <td>
                      <span
                        className={`collection-status ${statusClass(
                          request.status
                        )}`}
                      >
                        {getStatusIcon(request.status)}
                        {request.status}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="collections-table-footer">
          Showing <strong>{filteredRequests.length}</strong> of{" "}
          <strong>{enrichedRequests.length}</strong> live requests
          <span>· Automatically refreshes every 20 seconds</span>
        </div>
      </section>


      <div className="collections-footer">
        <span className="footer-live-dot" />
        Collection data synchronized with Overview and Live Monitoring.
      </div>


      {/* =====================================================
          NEW REQUEST MODAL
      ===================================================== */}

      {newRequestOpen &&
        createPortal(
          <div
            className="collection-modal-backdrop"
            onMouseDown={closeNewRequest}
          >
            <div
              className="collection-modal"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
            <div className="collection-modal-header">
              <div>
                <span className="modal-eyebrow">
                  ROUTE PLANNING
                </span>
                <h2>Create collection request</h2>
                <p>
                  Select a current live bin from {locationText}.
                </p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeNewRequest}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="collection-modal-body">
              <label htmlFor="new-request-bin">
                Live bin
              </label>

              <select
                id="new-request-bin"
                value={selectedBinCode}
                onChange={(event) =>
                  setSelectedBinCode(event.target.value)
                }
              >
                {selectableBins.map((bin) => (
                  <option
                    key={bin.bin_id}
                    value={bin.bin_code}
                  >
                    {bin.bin_code} · {bin.waste_level}% · {bin.status} · {bin.location}
                  </option>
                ))}
              </select>

              {selectedBinCode && (
                <div className="new-request-preview">
                  {(() => {
                    const bin = selectableBins.find(
                      (item) =>
                        String(item.bin_code) ===
                        String(selectedBinCode)
                    );

                    if (!bin) return null;

                    const level = Number(
                      bin.waste_level ??
                      bin.level ??
                      0
                    );

                    return (
                      <>
                        <div>
                          <strong>{bin.bin_code}</strong>
                          <span>{bin.location}</span>
                        </div>
                        <div className="new-request-preview-right">
                          <strong>{level}%</strong>
                          <span
                            className={`modal-status ${statusClass(
                              bin.status
                            )}`}
                          >
                            {bin.status}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {createMessage && (
                <div className="create-success-message">
                  <CheckCircle2 size={16} />
                  {createMessage}
                </div>
              )}
            </div>

            <div className="collection-modal-footer">
              <button
                type="button"
                className="modal-secondary-button"
                onClick={closeNewRequest}
              >
                Cancel
              </button>

              <button
                type="button"
                className="modal-primary-button"
                onClick={createNewRequest}
                disabled={selectableBins.length === 0}
              >
                <Plus size={16} />
                Create request
              </button>
            </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}


function ArrowAction() {
  return (
    <span className="arrow-action-symbol">
      →
    </span>
  );
}


export default Collections;
