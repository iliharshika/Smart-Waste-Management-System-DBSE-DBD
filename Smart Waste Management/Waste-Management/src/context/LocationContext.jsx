import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const LocationContext = createContext(null);

export function LocationProvider({ children }) {

  const [districtId, setDistrictId] = useState(
    localStorage.getItem("swmDistrictId") || ""
  );

  const [districtName, setDistrictName] = useState(
    localStorage.getItem("swmDistrictName") || ""
  );

  const [localityId, setLocalityId] = useState(
    localStorage.getItem("swmLocalityId") || ""
  );

  const [localityName, setLocalityName] = useState(
    localStorage.getItem("swmLocalityName") || ""
  );

  const [localities, setLocalities] = useState([]);

  const [loadingLocalities, setLoadingLocalities] =
    useState(false);


  /* =====================================================
     SAVE LOCATION
     ===================================================== */

  useEffect(() => {

    if (districtId) {
      localStorage.setItem(
        "swmDistrictId",
        districtId
      );
    } else {
      localStorage.removeItem("swmDistrictId");
    }

  }, [districtId]);


  useEffect(() => {

    if (districtName) {
      localStorage.setItem(
        "swmDistrictName",
        districtName
      );
    } else {
      localStorage.removeItem("swmDistrictName");
    }

  }, [districtName]);


  useEffect(() => {

    if (localityId) {
      localStorage.setItem(
        "swmLocalityId",
        localityId
      );
    } else {
      localStorage.removeItem("swmLocalityId");
    }

  }, [localityId]);


  useEffect(() => {

    if (localityName) {
      localStorage.setItem(
        "swmLocalityName",
        localityName
      );
    } else {
      localStorage.removeItem("swmLocalityName");
    }

  }, [localityName]);


  /* =====================================================
     LOAD LOCALITIES FOR SELECTED DISTRICT
     ===================================================== */

  useEffect(() => {

    if (!districtId) {

      setLocalities([]);
      return;

    }


    const loadLocalities = async () => {

      try {

        setLoadingLocalities(true);

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

      } catch (error) {

        console.error(
          "Location loading error:",
          error
        );

        setLocalities([]);

      } finally {

        setLoadingLocalities(false);

      }

    };


    loadLocalities();

  }, [districtId]);


  /* =====================================================
     SELECT DISTRICT
     ===================================================== */

  const selectDistrict = (
    id,
    name
  ) => {

    setDistrictId(String(id));
    setDistrictName(name);

    /* Changing district clears locality */

    setLocalityId("");
    setLocalityName("");

  };


  /* =====================================================
     SELECT LOCALITY
     ===================================================== */

  const selectLocality = (
    id,
    name
  ) => {

    setLocalityId(String(id));
    setLocalityName(name);

  };


  /* =====================================================
     CLEAR LOCATION
     ===================================================== */

  const clearLocation = () => {

    setDistrictId("");
    setDistrictName("");

    setLocalityId("");
    setLocalityName("");

    setLocalities([]);

  };


  return (

    <LocationContext.Provider
      value={{
        districtId,
        districtName,

        localityId,
        localityName,

        localities,
        loadingLocalities,

        selectDistrict,
        selectLocality,
        clearLocation,
      }}
    >

      {children}

    </LocationContext.Provider>

  );
}


/* =======================================================
   CUSTOM HOOK
   ======================================================= */

export function useLocation() {

  const context =
    useContext(LocationContext);

  if (!context) {

    throw new Error(
      "useLocation must be used inside LocationProvider"
    );

  }

  return context;
}