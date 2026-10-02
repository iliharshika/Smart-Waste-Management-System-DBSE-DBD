const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();

const PORT = process.env.PORT || 5000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());


// =====================================================
// BASIC TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.json({
    message: "Smart Waste Management Backend is running",
  });
});


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Backend is connected successfully",
  });
});


// =====================================================
// MYSQL CONNECTION TEST
// =====================================================

app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT 1 AS result"
    );

    res.json({
      status: "OK",
      message: "MySQL database connected successfully",
      result: rows[0].result,
    });

  } catch (error) {
    console.error(
      "MySQL connection error:",
      error.message
    );

    res.status(500).json({
      status: "ERROR",
      message: "MySQL connection failed",
      error: error.message,
    });
  }
});
// =====================================================
// DASHBOARD SUMMARY
// Location-aware dashboard data
// =====================================================

app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const { district_id, locality_id } = req.query;

    // District is required
    if (!district_id) {
      return res.status(400).json({
        status: "ERROR",
        message: "district_id is required",
      });
    }

    /*
      Location logic:

      If locality_id is supplied:
          show data for that locality.

      If locality_id is not supplied:
          show data for the whole selected district.

      This means we are NOT creating separate datasets
      for every locality.
    */

    let locationCondition = "";
    let locationParams = [];

    if (locality_id) {
      locationCondition = `
        b.locality_id = ?
      `;

      locationParams = [locality_id];
    } else {
      locationCondition = `
        l.district_id = ?
      `;

      locationParams = [district_id];
    }


    // ===================================================
    // TOTAL BINS
    // ===================================================

    const [totalBins] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM bins b
      INNER JOIN localities l
        ON b.locality_id = l.locality_id
      WHERE ${locationCondition}
      `,
      locationParams
    );


    // ===================================================
    // CRITICAL BINS
    // ===================================================

    const [criticalBins] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM bins b
      INNER JOIN localities l
        ON b.locality_id = l.locality_id
      WHERE ${locationCondition}
        AND b.status = 'Critical'
      `,
      locationParams
    );


    // ===================================================
    // ACTIVE COLLECTION REQUESTS
    // ===================================================

    const [collectionRequests] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM collection_requests cr
      INNER JOIN bins b
        ON cr.bin_id = b.bin_id
      INNER JOIN localities l
        ON b.locality_id = l.locality_id
      WHERE ${locationCondition}
        AND cr.status IN (
          'Pending',
          'Assigned',
          'In Progress'
        )
      `,
      locationParams
    );


    // ===================================================
    // COMPLETED COLLECTIONS TODAY
    // ===================================================

    const [completedToday] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM collection_requests cr
      INNER JOIN bins b
        ON cr.bin_id = b.bin_id
      INNER JOIN localities l
        ON b.locality_id = l.locality_id
      WHERE ${locationCondition}
        AND cr.status = 'Completed'
        AND cr.completed_at IS NOT NULL
        AND DATE(cr.completed_at) = CURDATE()
      `,
      locationParams
    );


    // ===================================================
    // RESPONSE
    // ===================================================

    res.json({
      status: "OK",

      data: {
        totalBins: totalBins[0].total,
        criticalBins: criticalBins[0].total,
        collectionRequests:
          collectionRequests[0].total,
        completedToday:
          completedToday[0].total,
      },
    });

  } catch (error) {

    console.error(
      "Location-aware dashboard summary error:",
      error.message
    );

    res.status(500).json({
      status: "ERROR",
      message: "Failed to load dashboard summary",
      error: error.message,
    });
  }
});


// =====================================================
// GET ALL DISTRICTS
// =====================================================

app.get("/api/districts", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        district_id,
        district_name
      FROM districts
      ORDER BY district_name
    `);

    res.json({
      status: "OK",
      data: rows,
    });

  } catch (error) {
    console.error(
      "District API error:",
      error.message
    );

    res.status(500).json({
      status: "ERROR",
      message: "Failed to load districts",
      error: error.message,
    });
  }
});


// =====================================================
// GET LOCALITIES BY DISTRICT
// =====================================================

app.get("/api/localities", async (req, res) => {
  try {
    const { district_id } = req.query;

    if (!district_id) {
      return res.status(400).json({
        status: "ERROR",
        message: "district_id is required",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        locality_id,
        locality_name,
        mandal_id,
        place_type
      FROM localities
      WHERE district_id = ?
      ORDER BY locality_name
      `,
      [district_id]
    );

    res.json({
      status: "OK",
      data: rows,
    });

  } catch (error) {
    console.error(
      "Locality API error:",
      error.message
    );

    res.status(500).json({
      status: "ERROR",
      message: "Failed to load localities",
      error: error.message,
    });
  }
});
// =====================================================
// LOCATION-AWARE OVERVIEW DATA
// =====================================================

app.get("/api/dashboard/overview", async (req, res) => {
  try {
    const { district_id, locality_id } = req.query;

    // District is required
    if (!district_id) {
      return res.status(400).json({
        status: "ERROR",
        message: "district_id is required",
      });
    }

    // -------------------------------------------------
    // LOCATION FILTER
    // -------------------------------------------------

    let locationCondition = "";
    let locationParams = [];

    if (locality_id) {
      locationCondition = "b.locality_id = ?";
      locationParams = [locality_id];
    } else {
      locationCondition = "l.district_id = ?";
      locationParams = [district_id];
    }


    // =================================================
    // 1. SUMMARY
    // =================================================

    const [summaryRows] = await pool.query(
      `
      SELECT

        COUNT(DISTINCT b.bin_id) AS totalBins,

        COUNT(
          DISTINCT CASE
            WHEN b.status = 'Critical'
            THEN b.bin_id
          END
        ) AS criticalBins

      FROM bins b

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}
      `,
      locationParams
    );


    const [openRequestRows] = await pool.query(
      `
      SELECT COUNT(*) AS total

      FROM collection_requests cr

      INNER JOIN bins b
        ON cr.bin_id = b.bin_id

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

        AND cr.status IN (
          'Pending',
          'Assigned',
          'In Progress'
        )
      `,
      locationParams
    );


    const [completedRows] = await pool.query(
      `
      SELECT COUNT(*) AS total

      FROM collection_requests cr

      INNER JOIN bins b
        ON cr.bin_id = b.bin_id

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

        AND cr.status = 'Completed'

        AND cr.completed_at IS NOT NULL

        AND DATE(cr.completed_at) = CURDATE()
      `,
      locationParams
    );


    // =================================================
    // 2. BIN DISTRIBUTION
    // =================================================

    const [distributionRows] = await pool.query(
      `
      SELECT
        b.status,
        COUNT(*) AS total

      FROM bins b

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

      GROUP BY b.status
      `,
      locationParams
    );


    // =================================================
    // 3. WASTE LEVELS - LAST 7 DAYS
    // =================================================

    const [wasteLevelRows] = await pool.query(
      `
      SELECT
        DATE(w.recorded_at) AS reading_date,
        ROUND(AVG(w.waste_level), 2) AS average_level

      FROM waste_levels w

      INNER JOIN bins b
        ON w.bin_id = b.bin_id

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

        AND w.recorded_at >=
            DATE_SUB(CURDATE(), INTERVAL 6 DAY)

      GROUP BY DATE(w.recorded_at)

      ORDER BY reading_date
      `,
      locationParams
    );


    // =================================================
    // 4. CRITICAL ALERTS
    // =================================================

    const [criticalAlertRows] = await pool.query(
      `
      SELECT
        b.bin_id,
        b.bin_code,
        b.location_description,
        b.current_level,
        b.status,

        (
          SELECT MAX(w.recorded_at)

          FROM waste_levels w

          WHERE w.bin_id = b.bin_id
        ) AS last_recorded_at

      FROM bins b

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

        AND b.status = 'Critical'

      ORDER BY b.current_level DESC

      LIMIT 5
      `,
      locationParams
    );


    // =================================================
    // 5. COLLECTION ACTIVITY - LAST 7 DAYS
    // =================================================

    const [collectionActivityRows] = await pool.query(
      `
      SELECT
        DATE(cr.requested_at) AS activity_date,
        COUNT(*) AS total

      FROM collection_requests cr

      INNER JOIN bins b
        ON cr.bin_id = b.bin_id

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

        AND cr.requested_at >=
            DATE_SUB(CURDATE(), INTERVAL 6 DAY)

      GROUP BY DATE(cr.requested_at)

      ORDER BY activity_date
      `,
      locationParams
    );


    // =================================================
    // 6. RECENT COLLECTION REQUESTS
    // =================================================

    const [requestRows] = await pool.query(
      `
      SELECT
        cr.request_id,
        cr.status,
        cr.requested_at,

        b.bin_code,
        b.location_description,
        b.status AS bin_status

      FROM collection_requests cr

      INNER JOIN bins b
        ON cr.bin_id = b.bin_id

      INNER JOIN localities l
        ON b.locality_id = l.locality_id

      WHERE ${locationCondition}

      ORDER BY cr.requested_at DESC

      LIMIT 5
      `,
      locationParams
    );


    // =================================================
    // RESPONSE
    // =================================================

    res.json({
      status: "OK",

      data: {

        summary: {
          totalBins:
            Number(summaryRows[0].totalBins) || 0,

          criticalBins:
            Number(summaryRows[0].criticalBins) || 0,

          openRequests:
            Number(openRequestRows[0].total) || 0,

          completedToday:
            Number(completedRows[0].total) || 0,
        },

        binDistribution:
          distributionRows.map((row) => ({
            status: row.status,
            total: Number(row.total),
          })),

        wasteLevels:
          wasteLevelRows.map((row) => ({
            date: row.reading_date,
            averageLevel:
              Number(row.average_level),
          })),

        criticalAlerts:
          criticalAlertRows.map((row) => ({
            binId: row.bin_id,
            binCode: row.bin_code,
            location:
              row.location_description,
            level:
              Number(row.current_level) || 0,
            status: row.status,
            recordedAt:
              row.last_recorded_at,
          })),

        collectionActivity:
          collectionActivityRows.map((row) => ({
            date: row.activity_date,
            total: Number(row.total),
          })),

        recentRequests:
          requestRows.map((row) => ({
            requestId: row.request_id,
            binCode: row.bin_code,
            location:
              row.location_description,
            status: row.status,
            binStatus: row.bin_status,
            requestedAt:
              row.requested_at,
          })),
      },
    });

  } catch (error) {

    console.error(
      "Location-aware overview API error:",
      error.message
    );

    res.status(500).json({
      status: "ERROR",
      message: "Failed to load overview data",
      error: error.message,
    });
  }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
  console.log(
    `Backend running on http://localhost:${PORT}`
  );
});