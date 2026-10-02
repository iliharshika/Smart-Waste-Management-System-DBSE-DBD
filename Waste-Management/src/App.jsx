import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

// =====================================================
// CONTROL ROOM
// =====================================================

import Overview from "./pages/Overview.jsx";
import Monitoring from "./pages/Monitoring.jsx";
import Collections from "./pages/Collections.jsx";
import RouteOptimization from "./pages/Route-Optimization.jsx";
import RouteOptimizationDetail from "./pages/Route-OptimizationDetail.jsx";

// =====================================================
// RESOURCES
// =====================================================

import SmartBins from "./pages/SmartBins.jsx";
import SmartBinDetail from "./pages/SmartBinDetail.jsx";
import Collectors from "./pages/Collectors.jsx";
import CollectorDetail from "./pages/CollectorDetail.jsx";
import Vehicles from "./pages/Vehicles.jsx";

// =====================================================
// WORKSPACE
// =====================================================

import ReportsAnalytics from "./pages/ReportsAnalytics.jsx";
import UsersRoles from "./pages/UsersRoles.jsx";
import Settings from "./pages/Settings.jsx";

// =====================================================
// LOCATION CONTEXT
// =====================================================

import {
  LocationProvider,
} from "./context/LocationContext.jsx";


// =====================================================
// PROTECTED DASHBOARD
// =====================================================

function ProtectedDashboard() {

  const savedUser =
    localStorage.getItem("swmUser");

  if (!savedUser) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return <Dashboard />;
}


// =====================================================
// HOME PAGE
// =====================================================

function Home() {

  const features = [
    {
      title: "Live Monitoring",
      description:
        "View current waste levels and monitor bin status across locations.",
      path: "/dashboard/monitoring",
      action: "Open monitoring →",
      className: "monitoring-feature",
      icon: "◔",
    },
    {
      title: "Route Optimization",
      description:
        "Organize collection stops and plan efficient service routes.",
      path: "/dashboard/route-optimization",
      action: "Plan a route →",
      className: "route-feature",
      icon: "⌖",
    },
    {
      title: "Data Analytics",
      description:
        "Review historical waste and collection records through reports.",
      path: "/dashboard/reports",
      action: "View analytics →",
      className: "analytics-feature",
      icon: "▥",
    },
    {
      title: "Collection Management",
      description:
        "Create, assign and track waste collection requests.",
      path: "/dashboard/collections",
      action: "Manage collections →",
      className: "collection-feature",
      icon: "▣",
    },
  ];

  const navigateTo = (event, path) => {

    event.preventDefault();

    window.history.pushState(
      {},
      "",
      path
    );

    window.dispatchEvent(
      new PopStateEvent("popstate")
    );
  };


  return (
    <section className="home-page">

      {/* No separate Home heading.
          Home is already shown in the top navigation. */}

      <section className="home-feature-grid">

        {features.map((feature) => (

          <a
            key={feature.title}
            href={feature.path}
            className={`home-feature-card ${feature.className}`}
            onClick={(event) =>
              navigateTo(
                event,
                feature.path
              )
            }
          >

            <div className="home-feature-icon">
              {feature.icon}
            </div>

            <div className="home-feature-content">

              <h2>
                {feature.title}
              </h2>

              <p>
                {feature.description}
              </p>

              <span className="home-feature-action">
                {feature.action}
              </span>

            </div>

          </a>

        ))}

      </section>


      <section className="home-bottom-info">

        <div>
          <span className="home-info-icon">
            ✓
          </span>

          <span>
            Centralized Records
          </span>
        </div>


        <div>
          <span className="home-info-icon">
            ✓
          </span>

          <span>
            Collection Tracking
          </span>
        </div>


        <div>
          <span className="home-info-icon">
            ✓
          </span>

          <span>
            Historical Data
          </span>
        </div>

      </section>

    </section>
  );
}


// =====================================================
// APP
// =====================================================

function App() {

  return (

    <BrowserRouter>

      <LocationProvider>

        <Routes>

          {/* =================================================
              LOGIN
              ================================================= */}

          <Route
            path="/login"
            element={<Login />}
          />


          {/* =================================================
              DASHBOARD SHELL
              Sidebar + topbar remain visible.
              ================================================= */}

          <Route
            path="/dashboard"
            element={<ProtectedDashboard />}
          >

            {/* /dashboard -> /dashboard/home */}

            <Route
              index
              element={
                <Navigate
                  to="/dashboard/home"
                  replace
                />
              }
            />


            {/* HOME */}

            <Route
              path="home"
              element={<Home />}
            />


            {/* =================================================
                CONTROL ROOM
                ================================================= */}

            <Route
              path="overview"
              element={<Overview />}
            />

            <Route
              path="monitoring"
              element={<Monitoring />}
            />

            <Route
              path="collections"
              element={<Collections />}
            />

            <Route
              path="route-optimization"
              element={<RouteOptimization />}
            />

            <Route
              path="route-optimization/:binCode"
              element={<RouteOptimizationDetail />}
            />


            {/* =================================================
                RESOURCES
                ================================================= */}

            <Route
              path="smart-bins"
              element={<SmartBins />}
            />

            {/* SMART BIN DETAIL */}
            <Route
              path="smart-bins/:binCode"
              element={<SmartBinDetail />}
            />

            <Route
              path="collectors"
              element={<Collectors />}
            />

            <Route
              path="collectors/:collectorId"
              element={<CollectorDetail />}
            />

            <Route
              path="vehicles"
              element={<Vehicles />}
            />


            {/* =================================================
                WORKSPACE
                ================================================= */}

            <Route
              path="reports"
              element={<ReportsAnalytics />}
            />

            <Route
              path="users-roles"
              element={<UsersRoles />}
            />

            <Route
              path="settings"
              element={<Settings />}
            />

          </Route>


          {/* =================================================
              OLD DIRECT URLS
              ================================================= */}

          <Route
            path="/overview"
            element={
              <Navigate
                to="/dashboard/overview"
                replace
              />
            }
          />

          <Route
            path="/monitoring"
            element={
              <Navigate
                to="/dashboard/monitoring"
                replace
              />
            }
          />

          <Route
            path="/collections"
            element={
              <Navigate
                to="/dashboard/collections"
                replace
              />
            }
          />

          <Route
            path="/route-optimization"
            element={
              <Navigate
                to="/dashboard/route-optimization"
                replace
              />
            }
          />

          <Route
            path="/smart-bins"
            element={
              <Navigate
                to="/dashboard/smart-bins"
                replace
              />
            }
          />

          <Route
            path="/collectors"
            element={
              <Navigate
                to="/dashboard/collectors"
                replace
              />
            }
          />

          <Route
            path="/vehicles"
            element={
              <Navigate
                to="/dashboard/vehicles"
                replace
              />
            }
          />

          <Route
            path="/reports"
            element={
              <Navigate
                to="/dashboard/reports"
                replace
              />
            }
          />

          <Route
            path="/users-roles"
            element={
              <Navigate
                to="/dashboard/users-roles"
                replace
              />
            }
          />

          <Route
            path="/settings"
            element={
              <Navigate
                to="/dashboard/settings"
                replace
              />
            }
          />


          {/* =================================================
              ROOT -> LOGIN
              ================================================= */}

          <Route
            path="/"
            element={
              <Navigate
                to="/login"
                replace
              />
            }
          />


          {/* =================================================
              UNKNOWN URL -> LOGIN
              ================================================= */}

          <Route
            path="*"
            element={
              <Navigate
                to="/login"
                replace
              />
            }
          />

        </Routes>

      </LocationProvider>

    </BrowserRouter>
  );
}


export default App;
