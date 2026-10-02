import { useEffect, useState } from "react";

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Recycle,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  Truck,
} from "lucide-react";

import "../styles/Login.css";


function Login() {

  /* =========================================================
     FORM STATE
     ========================================================= */

  const [role, setRole] = useState("");
  const [district, setDistrict] = useState("");
  const [locality, setLocality] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  /* =========================================================
     DATABASE LOCATION DATA
     ========================================================= */

  const [districts, setDistricts] = useState([]);
  const [districtId, setDistrictId] = useState("");
  const [localities, setLocalities] = useState([]);
  const [localityId, setLocalityId] = useState("");

  const [districtsLoading, setDistrictsLoading] =
    useState(true);

  const [localitiesLoading, setLocalitiesLoading] =
    useState(false);


  /* =========================================================
     REQUIRED EMAIL DOMAIN
     ========================================================= */

  const requiredDomain =
    role === "Locality User"
      ? "@gmail.com"
      : role === "Administrator" ||
        role === "Municipal Worker"
      ? "@smart.edu.in"
      : "";


  /* =========================================================
     ROLE CHANGE
     ========================================================= */

  const handleRoleChange = (e) => {

    const selectedRole = e.target.value;

    setRole(selectedRole);

    // Reset district and locality when role changes
    setDistrict("");
    setDistrictId("");
    setLocality("");
    setLocalityId("");
    setLocalities([]);

    // Reset email
    setEmail("");

    // Reset error
    setError("");
  };


  /* =========================================================
     LOAD DISTRICTS FROM MYSQL
     ========================================================= */

  useEffect(() => {

    const loadDistricts = async () => {

      try {

        setDistrictsLoading(true);

        const response = await fetch(
          "http://localhost:5000/api/districts"
        );

        if (!response.ok) {
          throw new Error(
            `District API returned ${response.status}`
          );
        }

        const result = await response.json();

        if (result.status !== "OK") {
          throw new Error(
            result.message ||
              "Unable to load districts."
          );
        }

        setDistricts(
          Array.isArray(result.data)
            ? result.data
            : []
        );

      } catch (loadError) {

        console.error(
          "Unable to load districts:",
          loadError
        );

        setError(
          "Unable to load districts from the database."
        );

      } finally {

        setDistrictsLoading(false);

      }

    };

    loadDistricts();

  }, []);


  /* =========================================================
     LOAD LOCALITIES WHEN DISTRICT CHANGES
     ========================================================= */

  useEffect(() => {

    if (!districtId) {

      setLocalities([]);
      setLocality("");
      setLocalityId("");

      return;
    }

    const loadLocalities = async () => {

      try {

        setLocalitiesLoading(true);
        setLocalities([]);
        setLocality("");
        setLocalityId("");

        const response = await fetch(
          `http://localhost:5000/api/localities?district_id=${districtId}`
        );

        if (!response.ok) {
          throw new Error(
            `Locality API returned ${response.status}`
          );
        }

        const result = await response.json();

        if (result.status !== "OK") {
          throw new Error(
            result.message ||
              "Unable to load localities."
          );
        }

        setLocalities(
          Array.isArray(result.data)
            ? result.data
            : []
        );

      } catch (loadError) {

        console.error(
          "Unable to load localities:",
          loadError
        );

        setLocalities([]);

        setError(
          "Unable to load localities for the selected district."
        );

      } finally {

        setLocalitiesLoading(false);

      }

    };

    loadLocalities();

  }, [districtId]);


  /* =========================================================
     LOGIN SUBMIT
     ========================================================= */

  const handleSubmit = async (e) => {

    e.preventDefault();
    setError("");

    if (!role) {
      setError("Please select your access type.");
      return;
    }

    if (!district) {
      setError("Please select your district.");
      return;
    }

    if (role === "Locality User" && !locality.trim()) {
      setError("Please select your locality.");
      return;
    }

    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (
      !email
        .trim()
        .toLowerCase()
        .endsWith(requiredDomain)
    ) {
      setError(
        `Please use an email address ending with ${requiredDomain}.`
      );
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    /* =========================================================
       SAVE THE LOGIN ACCOUNT IN MYSQL
       =========================================================
       The old version saved this only in localStorage. That is
       why Users & Roles could see collectors from MySQL but not
       Administrators or Locality Users.
    */
    try {
      const response = await fetch(
        "http://localhost:8000/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            name: username.trim(),
            email: email.trim(),
            password,
            role,
            district_id: districtId || null,
            locality_id:
              role === "Locality User"
                ? localityId || null
                : null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.status !== "OK") {
        throw new Error(
          result.message ||
            "Unable to save the login account."
        );
      }

      const savedUser = result.data || {};

      const userData = {
        username: savedUser.username || username.trim(),
        role: savedUser.role || role,
        district: district,
        districtId: savedUser.district_id || districtId,
        locality:
          role === "Locality User"
            ? locality.trim()
            : "",
        localityId:
          role === "Locality User"
            ? savedUser.locality_id || localityId
            : "",
        email: savedUser.email || email.trim(),
      };

      localStorage.setItem(
        "swmUser",
        JSON.stringify(userData)
      );

      window.location.href = "/dashboard";

    } catch (loginError) {
      console.error(
        "Unable to save login account:",
        loginError
      );

      setError(
        loginError.message ||
          "Unable to connect to the user database."
      );
    }
  };


  return (

    <div className="login-page">


      {/* =====================================================
          LEFT SIDE
          ===================================================== */}

      <section className="login-showcase">


        {/* BACKGROUND CIRCLES */}

        <div className="background-circle circle-one"></div>

        <div className="background-circle circle-two"></div>


        <div className="showcase-content">


          {/* =================================================
              BRAND
              ================================================= */}

          <div className="brand">

            <div className="brand-icon">

              <Recycle
                size={25}
                strokeWidth={2.4}
              />

            </div>


            <div className="brand-text">

              <h2>
                SWM
              </h2>

              <span>
                Smart Waste Management
              </span>

            </div>

          </div>


          {/* =================================================
              HERO LABEL
              ================================================= */}

          <div className="hero-label">

            <span></span>

            SMART WASTE OPERATIONS

          </div>


          {/* =================================================
              HERO TITLE
              ================================================= */}

          <h1 className="hero-title">

            Smarter Waste.

            <br />

            <span>
              Cleaner Future.
            </span>

          </h1>


          {/* =================================================
              DESCRIPTION
              ================================================= */}

          <p className="hero-description">

            A centralized waste management system designed to
            organize, monitor and manage waste collection
            efficiently.

          </p>


          {/* =================================================
              FEATURES
              ================================================= */}

          <div className="feature-grid">


            {/* SMART BIN MANAGEMENT */}

            <div className="feature-card">

              <div className="feature-icon">

                <Trash2
                  size={24}
                />

              </div>


              <div className="feature-content">

                <h3>
                  Smart Bin Management
                </h3>

                <p>
                  Manage bin locations, capacity and status.
                </p>

              </div>

            </div>


            {/* COLLECTION MANAGEMENT */}

            <div className="feature-card">

              <div className="feature-icon">

                <Truck
                  size={24}
                />

              </div>


              <div className="feature-content">

                <h3>
                  Collection Management
                </h3>

                <p>
                  Organize and track waste collection requests.
                </p>

              </div>

            </div>


            {/* REPORTS */}

            <div className="feature-card">

              <div className="feature-icon">

                <BarChart3
                  size={24}
                />

              </div>


              <div className="feature-content">

                <h3>
                  Reports &amp; Analytics
                </h3>

                <p>
                  View useful insights from stored waste data.
                </p>

              </div>

            </div>


            {/* USERS */}

            <div className="feature-card">

              <div className="feature-icon">

                <UsersRound
                  size={24}
                />

              </div>


              <div className="feature-content">

                <h3>
                  Users &amp; Roles
                </h3>

                <p>
                  Manage access for different system users.
                </p>

              </div>

            </div>


          </div>


          {/* =================================================
              BENEFITS
              ================================================= */}

          <div className="benefits">


            <div className="benefit">

              <CheckCircle2
                size={16}
              />

              <span>
                Centralized Records
              </span>

            </div>


            <div className="benefit">

              <CheckCircle2
                size={16}
              />

              <span>
                Collection Tracking
              </span>

            </div>


            <div className="benefit">

              <CheckCircle2
                size={16}
              />

              <span>
                Historical Data
              </span>

            </div>


          </div>


        </div>


        {/* =================================================
            COPYRIGHT
            ================================================= */}

        <div className="copyright">

          © 2026 Smart Waste Management System

        </div>


      </section>


      {/* =====================================================
          RIGHT LOGIN SIDE
          ===================================================== */}

      <section className="login-section">


        <div className="login-card">


          {/* =================================================
              LOGIN HEADER
              ================================================= */}

          <div className="login-header">


            <div className="welcome-icon">

              <ShieldCheck
                size={26}
              />

            </div>


            <div>

              <h2>
                Welcome Back!
              </h2>

              <p>
                Sign in to access your waste management dashboard.
              </p>

            </div>


          </div>


          {/* =================================================
              LOGIN FORM
              ================================================= */}

          <form
            onSubmit={handleSubmit}
          >


            {/* =================================================
                ACCESS TYPE
                ================================================= */}

            <div className="form-group">


              <label htmlFor="role">
                Access Type
              </label>


              <div className="input-wrapper">


                <UserRound
                  size={19}
                />


                <select
                  id="role"
                  value={role}
                  onChange={handleRoleChange}
                >

                  <option value="">
                    Select Access Type
                  </option>

                  <option value="Administrator">
                    Administrator
                  </option>

                  <option value="Municipal Worker">
                    Municipal Worker
                  </option>

                  <option value="Locality User">
                    Locality User
                  </option>

                </select>


              </div>


            </div>


            {/* =================================================
                ROLE INFORMATION
                ================================================= */}

            <div className="info-box">


              <span className="info-icon">
                i
              </span>


              <p>

                Choose your role to continue.
                Available roles:
                Administrator,
                Municipal Worker,
                Locality User.

              </p>


            </div>


            {/* =================================================
                DISTRICT
                ================================================= */}

            <div className="form-group">

              <label htmlFor="district">
                District
              </label>

              <div className="input-wrapper">

                <MapPin
                  size={19}
                />

                <select
                  id="district"
                  value={districtId}
                  disabled={districtsLoading}
                  onChange={(e) => {

                    const selectedDistrictId =
                      e.target.value;

                    const selectedDistrict =
                      districts.find(
                        (item) =>
                          String(item.district_id) ===
                          selectedDistrictId
                      );

                    setDistrictId(
                      selectedDistrictId
                    );

                    setDistrict(
                      selectedDistrict
                        ? selectedDistrict.district_name
                        : ""
                    );

                    // Clear locality when district changes
                    setLocality("");
                    setLocalityId("");
                    setError("");

                  }}
                >

                  <option value="">
                    {districtsLoading
                      ? "Loading Districts..."
                      : "Select District"}
                  </option>

                  {districts.map(
                    (item) => (
                      <option
                        key={item.district_id}
                        value={item.district_id}
                      >
                        {item.district_name}
                      </option>
                    )
                  )}

                </select>

              </div>

            </div>


            {/* =================================================
                LOCALITY
                Only for Locality User
                ================================================= */}

            {role === "Locality User" && (

              <div className="form-group">

                <label htmlFor="locality">
                  Locality
                </label>

                <div className="input-wrapper">

                  <MapPin
                    size={19}
                  />

                  <select
                    id="locality"
                    value={localityId}
                    disabled={
                      !districtId ||
                      localitiesLoading
                    }
                    onChange={(e) => {

                      const selectedLocalityId =
                        e.target.value;

                      const selectedLocality =
                        localities.find(
                          (item) =>
                            String(
                              item.locality_id
                            ) ===
                            selectedLocalityId
                        );

                      setLocalityId(
                        selectedLocalityId
                      );

                      setLocality(
                        selectedLocality
                          ? selectedLocality.locality_name
                          : ""
                      );

                      setError("");

                    }}
                  >

                    <option value="">
                      {!districtId
                        ? "Select District First"
                        : localitiesLoading
                        ? "Loading Localities..."
                        : localities.length === 0
                        ? "No Localities Found"
                        : "Select Locality"}
                    </option>

                    {localities.map(
                      (item) => (
                        <option
                          key={item.locality_id}
                          value={item.locality_id}
                        >
                          {item.locality_name}
                        </option>
                      )
                    )}

                  </select>

                </div>

              </div>

            )}


            {/* =================================================
                USERNAME
                ================================================= */}

            <div className="form-group">


              <label htmlFor="username">
                Username
              </label>


              <div className="input-wrapper">


                <UserRound
                  size={19}
                />


                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {

                    setUsername(
                      e.target.value
                    );

                    setError("");

                  }}
                  placeholder="Enter your username"
                  autoComplete="username"
                />


              </div>


            </div>


            {/* =================================================
                EMAIL
                ================================================= */}

            <div className="form-group">


              <label htmlFor="email">

                {role === "Locality User"
                  ? "Personal Email"
                  : "Work Email"}

              </label>


              <div className="input-wrapper">


                <Mail
                  size={19}
                />


                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {

                    setEmail(
                      e.target.value
                    );

                    setError("");

                  }}
                  placeholder={
                    role === "Locality User"
                      ? "Enter your Gmail address"
                      : "Enter your institutional email"
                  }
                  autoComplete="email"
                />


              </div>


            </div>


            {/* =================================================
                EMAIL INFORMATION
                ================================================= */}

            <div className="email-info-box">


              <span className="email-info-icon">
                i
              </span>


              <p>

                Use your
                {" "}
                <strong>
                  @smart.edu.in
                </strong>
                {" "}
                email for Administrators and Municipal Workers.
                Use your
                {" "}
                <strong>
                  @gmail.com
                </strong>
                {" "}
                email for Locality Users.

              </p>


            </div>


            {/* =================================================
                PASSWORD
                ================================================= */}

            <div className="form-group">


              <div className="password-heading">


                <label htmlFor="password">
                  Password
                </label>


                <button
                  type="button"
                  className="forgot-password"
                  onClick={() =>
                    alert(
                      "Password recovery will be connected later."
                    )
                  }
                >

                  Forgot password?

                </button>


              </div>


              <div className="input-wrapper">


                <LockKeyhole
                  size={19}
                />


                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) => {

                    setPassword(
                      e.target.value
                    );

                    setError("");

                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />


                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >

                  {showPassword ? (

                    <EyeOff
                      size={19}
                    />

                  ) : (

                    <Eye
                      size={19}
                    />

                  )}

                </button>


              </div>


            </div>


            {/* =================================================
                ERROR
                ================================================= */}

            {error && (

              <div className="error-message">

                {error}

              </div>

            )}


            {/* =================================================
                OPTIONS
                ================================================= */}

            <div className="form-options">


              <label className="remember-me">


                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) =>
                    setRememberMe(
                      e.target.checked
                    )
                  }
                />


                <span>
                  Remember me
                </span>


              </label>


              <div className="secure-login">

                <LockKeyhole
                  size={13}
                />

                <span>
                  Secure login
                </span>

              </div>


            </div>


            {/* =================================================
                SIGN IN
                ================================================= */}

            <button
              type="submit"
              className="sign-in-button"
            >

              <span>
                Sign In
              </span>

              <ArrowRight
                size={19}
              />

            </button>


          </form>


          {/* =================================================
              FOOTER
              ================================================= */}

          <div className="login-footer">


            <div className="footer-divider">

              <span></span>

              <p>
                Smart Waste Management System
              </p>

              <span></span>

            </div>


            <p className="footer-description">

              Manage waste records. Coordinate collections.

              <br />

              Build cleaner communities.

            </p>


          </div>


        </div>


      </section>


    </div>
  );
}


export default Login;