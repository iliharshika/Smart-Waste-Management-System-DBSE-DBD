import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BarChart3,
  ChevronDown,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  Menu,
  Package,
  Settings,
  Truck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLocation as useDashboardLocation } from "../context/LocationContext.jsx";
import "../styles/Dashboard.css";

function Dashboard() {
  const routeLocation = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  /* =====================================================
     LOGGED-IN USER
     ===================================================== */

  const loggedInUser = useMemo(() => {
    try {
      const saved = localStorage.getItem("swmUser");

      if (saved) {
        const user = JSON.parse(saved);

        return {
          username: user.username?.trim() || "Guest",
          role: user.role || "User",
          district: user.district || "",
          districtId: user.districtId || "",
          locality: user.locality || "",
          localityId: user.localityId || "",
          email: user.email || "",
        };
      }
    } catch (error) {
      console.error("Unable to read logged-in user:", error);
    }

    return {
      username: "Guest",
      role: "User",
      district: "",
      districtId: "",
      locality: "",
      localityId: "",
      email: "",
    };
  }, []);

  /* =====================================================
     SHARED LOCATION STATE
     ===================================================== */

  const {
    districtId,
    districtName,
    localityId,
    localityName,
    localities,
    loadingLocalities,
    selectDistrict,
    selectLocality,
  } = useDashboardLocation();

  const isLocalityUser =
    loggedInUser.role === "Locality User";


  /* =====================================================
     SYNC LOGIN DISTRICT INTO SHARED LOCATION STATE
     ===================================================== */

  useEffect(() => {
    if (!loggedInUser.districtId) {
      return;
    }

    if (String(districtId) !== String(loggedInUser.districtId)) {
      selectDistrict(
        loggedInUser.districtId,
        loggedInUser.district || ""
      );
    }
  }, [
    loggedInUser.districtId,
    loggedInUser.district,
    districtId,
    selectDistrict,
  ]);


  /* =====================================================
     LOCALITY USER LOCATION IS LOCKED
     ===================================================== */

  useEffect(() => {
    if (!isLocalityUser) {
      return;
    }

    if (!loggedInUser.localityId) {
      return;
    }

    if (
      String(localityId) !==
      String(loggedInUser.localityId)
    ) {
      selectLocality(
        loggedInUser.localityId,
        loggedInUser.locality || ""
      );
    }
  }, [
    isLocalityUser,
    loggedInUser.localityId,
    loggedInUser.locality,
    localityId,
    selectLocality,
  ]);


  /* =====================================================
     SELECT LOCALITY
     ===================================================== */

  const handleLocalityChange = (event) => {
    if (isLocalityUser) {
      return;
    }

    const selectedId = event.target.value;

    const selectedLocality = localities.find(
      (item) =>
        String(item.locality_id) ===
        String(selectedId)
    );

    if (!selectedLocality) {
      selectLocality("", "");

      window.dispatchEvent(
        new CustomEvent("swmLocationChanged", {
          detail: {
            districtId,
            districtName,
            localityId: "",
            localityName: "",
          },
        })
      );

      return;
    }

    const newLocalityId = String(
      selectedLocality.locality_id
    );

    const newLocalityName =
      selectedLocality.locality_name;

    selectLocality(
      newLocalityId,
      newLocalityName
    );

    window.dispatchEvent(
      new CustomEvent("swmLocationChanged", {
        detail: {
          districtId,
          districtName,
          localityId: newLocalityId,
          localityName: newLocalityName,
        },
      })
    );
  };


  /* =====================================================
     CURRENT DATE
     ===================================================== */

  const today = new Date().toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );


  /* =====================================================
     LOGOUT
     ===================================================== */

  const handleLogout = () => {
    localStorage.removeItem("swmUser");
    localStorage.removeItem("swmDistrictId");
    localStorage.removeItem("swmDistrictName");
    localStorage.removeItem("swmLocalityId");
    localStorage.removeItem("swmLocalityName");

    window.location.href = "/login";
  };


  /* =====================================================
     SIDEBAR GROUPS
     ===================================================== */

  const groups = [
    {
      title: "CONTROL ROOM",
      items: [
        [
          "Overview",
          "/dashboard/overview",
          LayoutDashboard,
        ],
        [
          "Live Monitoring",
          "/dashboard/monitoring",
          Gauge,
        ],
        [
          "Collections",
          "/dashboard/collections",
          ClipboardList,
        ],
        [
          "Route Optimization",
          "/dashboard/route-optimization",
          MapPin,
        ],
      ],
    },
    {
      title: "RESOURCES",
      items: [
        [
          "Smart Bins",
          "/dashboard/smart-bins",
          Package,
        ],
        [
          "Collectors",
          "/dashboard/collectors",
          Users,
        ],
        [
          "Vehicles",
          "/dashboard/vehicles",
          Truck,
        ],
      ],
    },
    {
      title: "WORKSPACE",
      items: [
        [
          "Reports",
          "/dashboard/reports",
          BarChart3,
        ],
        [
          "Users & Roles",
          "/dashboard/users-roles",
          Users,
        ],
        [
          "Settings",
          "/dashboard/settings",
          Settings,
        ],
      ],
    },
  ];


  /* =====================================================
     PANEL HELPERS
     ===================================================== */

  const closePanels = () => {
    setNotificationOpen(false);
    setProfileOpen(false);
    setSidebarOpen(false);
  };


  const pageName =
    routeLocation.pathname === "/dashboard" ||
    routeLocation.pathname === "/dashboard/home"
      ? "Home"
      : routeLocation.pathname
          .split("/")
          .pop()
          ?.replaceAll("-", " ") || "Home";


  return (
    <div className="dashboard-page">

      {/* =================================================
          MOBILE SIDEBAR OVERLAY
          ================================================= */}

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}


      {/* =================================================
          SIDEBAR
          ================================================= */}

      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >

        <div className="sidebar-header">

          <div className="dashboard-brand-icon">
            <Activity size={26} />
          </div>

          <div className="sidebar-brand-copy">
            <h2>SWM</h2>
            <span>Smart Waste Management</span>
          </div>

          <button
            className="sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>

        </div>


        <nav className="sidebar-nav">

          {groups.map((group) => (
            <div key={group.title}>

              <div className="nav-section-title">
                {group.title}
              </div>

              {group.items.map(
                ([label, path, Icon]) => {

                  const active =
                    routeLocation.pathname === path ||
                    routeLocation.pathname.startsWith(
                      `${path}/`
                    );

                  return (
                    <Link
                      key={path}
                      to={path}
                      className={`nav-item ${
                        active ? "active" : ""
                      }`}
                      onClick={closePanels}
                    >

                      <Icon size={19} />

                      <span>
                        {label}
                      </span>

                    </Link>
                  );
                }
              )}

            </div>
          ))}

        </nav>


        <div className="sidebar-bottom">

          <div className="sidebar-system-card">

            <div className="system-status-dot" />

            <div>
              <strong>
                System Status
              </strong>

              <span>
                All services operational
              </span>
            </div>

          </div>

        </div>

      </aside>


      {/* =================================================
          MAIN DASHBOARD
          ================================================= */}

      <main className="dashboard-main">


        {/* =================================================
            TOP BAR
            ================================================= */}

        <header className="dashboard-topbar">


          <div className="topbar-left">

            <button
              className="mobile-menu-button"
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={21} />
            </button>


            <div className="topbar-breadcrumb">

              <span>
                Operations
              </span>

              <span className="breadcrumb-separator">
                /
              </span>

              <strong>
                {pageName}
              </strong>

            </div>

          </div>


          <div className="topbar-actions">


            {/* =================================================
                LOCATION SELECTOR
                ================================================= */}

            <div
              className={`location-selector ${
                isLocalityUser
                  ? "location-locked"
                  : ""
              }`}
              title={
                isLocalityUser
                  ? "Locality users cannot change location"
                  : "Select locality"
              }
            >

              <MapPin size={17} />

              <div className="location-copy">

                <span>
                  Location
                </span>

                <strong>
                  {localityName ||
                    (loadingLocalities
                      ? "Loading..."
                      : "Select locality")}
                </strong>

              </div>


              {isLocalityUser ? (

                <LockKeyhole
                  size={14}
                  className="location-lock-icon"
                />

              ) : (

                <ChevronDown
                  size={15}
                />

              )}


              {!isLocalityUser && (
                <select
                  aria-label="Select locality"
                  value={localityId}
                  disabled={
                    loadingLocalities ||
                    !districtId ||
                    localities.length === 0
                  }
                  onChange={
                    handleLocalityChange
                  }
                >
                  <option value="">
                    {loadingLocalities
                      ? "Loading..."
                      : "Select Locality"}
                  </option>

                  {localities.map(
                    (item) => (
                      <option
                        key={
                          item.locality_id
                        }
                        value={
                          item.locality_id
                        }
                      >
                        {item.locality_name}
                      </option>
                    )
                  )}
                </select>
              )}

            </div>


            {/* =================================================
                DATE
                ================================================= */}

            <div className="current-date">

              <span className="date-status-dot" />

              <span>
                {today}
              </span>

            </div>


            {/* =================================================
                NOTIFICATIONS
                ================================================= */}

            <div className="notification-wrapper">

              <button
                type="button"
                className="notification-button"

                onClick={() => {
                  setNotificationOpen(
                    (v) => !v
                  );

                  setProfileOpen(false);
                }}

                aria-label="Notifications"
              >

                <Bell size={21} />

                <span className="notification-dot">
                  3
                </span>

              </button>


              {notificationOpen && (
                <>

                  <div
                    className="popup-overlay"
                    onClick={() =>
                      setNotificationOpen(
                        false
                      )
                    }
                  />


                  <div className="notification-dropdown">

                    <div className="notification-header">

                      <div>
                        <strong>
                          Notifications
                        </strong>

                        <span>
                          3 new notifications
                        </span>
                      </div>


                      <button
                        className="notification-close"
                        type="button"
                        onClick={() =>
                          setNotificationOpen(
                            false
                          )
                        }
                      >
                        ×
                      </button>

                    </div>


                    <div className="notification-item">

                      <div className="notification-item-icon critical">
                        !
                      </div>

                      <div className="notification-item-content">

                        <strong>
                          Critical bin detected
                        </strong>

                        <span>
                          BIN-001 has reached
                          92% capacity.
                        </span>

                        <small>
                          Waste level alert
                        </small>

                      </div>

                    </div>


                    <div className="notification-item">

                      <div className="notification-item-icon collection">
                        ✓
                      </div>

                      <div className="notification-item-content">

                        <strong>
                          Collection completed
                        </strong>

                        <span>
                          A collection request
                          was completed successfully.
                        </span>

                        <small>
                          Collection management
                        </small>

                      </div>

                    </div>


                    <div className="notification-item">

                      <div className="notification-item-icon info">
                        i
                      </div>

                      <div className="notification-item-content">

                        <strong>
                          New collection request
                        </strong>

                        <span>
                          A new request is
                          waiting for assignment.
                        </span>

                        <small>
                          Collection management
                        </small>

                      </div>

                    </div>


                    <div className="notification-footer">

                      <button
                        type="button"
                        onClick={() =>
                          setNotificationOpen(
                            false
                          )
                        }
                      >
                        Close notifications
                      </button>

                    </div>

                  </div>

                </>
              )}

            </div>


            {/* =================================================
                USER PROFILE
                ================================================= */}

            <div className="profile-wrapper">

              <button
                type="button"
                className="user-profile"

                onClick={() => {
                  setProfileOpen(
                    (v) => !v
                  );

                  setNotificationOpen(false);
                }}
              >

                <div className="user-avatar">
                  <UserCircle
                    size={31}
                  />
                </div>


                <div className="user-details">

                  <strong>
                    {loggedInUser.username}
                  </strong>

                  <span>
                    {loggedInUser.role}
                  </span>

                </div>


                <ChevronDown size={16} />

              </button>


              {profileOpen && (
                <>

                  <div
                    className="popup-overlay"
                    onClick={() =>
                      setProfileOpen(
                        false
                      )
                    }
                  />


                  <div className="profile-dropdown">

                    <div className="profile-dropdown-header">

                      <div className="profile-large-avatar">
                        <UserCircle
                          size={35}
                        />
                      </div>

                      <div>

                        <strong>
                          {loggedInUser.username}
                        </strong>

                        <span>
                          {loggedInUser.role}
                        </span>

                      </div>

                    </div>


                    <div className="profile-details-list">

                      <div className="profile-detail">

                        <span>
                          Username
                        </span>

                        <strong>
                          {loggedInUser.username}
                        </strong>

                      </div>


                      <div className="profile-detail">

                        <span>
                          Email
                        </span>

                        <strong>
                          {loggedInUser.email ||
                            "Not provided"}
                        </strong>

                      </div>


                      <div className="profile-detail">

                        <span>
                          District
                        </span>

                        <strong>
                          {districtName ||
                            loggedInUser.district ||
                            "Not provided"}
                        </strong>

                      </div>


                      <div className="profile-detail">

                        <span>
                          Location
                        </span>

                        <strong>
                          {localityName ||
                            "Not selected"}
                        </strong>

                      </div>

                    </div>


                    <div className="profile-dropdown-footer">

                      <button
                        type="button"
                        className="logout-button"
                        onClick={handleLogout}
                      >
                        Logout
                      </button>

                    </div>

                  </div>

                </>
              )}

            </div>

          </div>

        </header>


        {/* =================================================
            MODULE CONTENT
            Sidebar + Topbar stay fixed.
            Only this content changes.
            ================================================= */}

        <div className="dashboard-content">
          <Outlet
            context={{
              loggedInUser,
              today,
              districtId,
              districtName,
              localityId,
              localityName,
            }}
          />
        </div>

      </main>

    </div>
  );
}

export default Dashboard;
