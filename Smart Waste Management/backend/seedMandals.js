const https = require("https");
const mysql = require("mysql2/promise");
require("dotenv").config();


// =====================================================
// TELANGANA GIS MANDAL LAYER
// =====================================================

const QUERY_URL =
  "https://tgrac.telangana.gov.in/arcgis/rest/services/" +
  "Master_Administrative_Folder/" +
  "Master_Administrative_Boundary_test/" +
  "FeatureServer/4/query";

const BATCH_SIZE = 500;


// =====================================================
// HTTPS AGENT
// =====================================================

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});


// =====================================================
// POST REQUEST
// =====================================================

function postJson(url, params) {
  return new Promise((resolve, reject) => {

    const body =
      new URLSearchParams(params).toString();

    const urlObject = new URL(url);

    const options = {
      hostname: urlObject.hostname,
      path: urlObject.pathname,
      method: "POST",
      agent: httpsAgent,

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",

        "Content-Length":
          Buffer.byteLength(body),
      },
    };


    const req = https.request(
      options,
      (res) => {

        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });


        res.on("end", () => {

          if (res.statusCode !== 200) {

            reject(
              new Error(
                `HTTP ${res.statusCode}: ${data}`
              )
            );

            return;
          }


          try {

            const json =
              JSON.parse(data);


            if (json.error) {

              reject(
                new Error(
                  JSON.stringify(json.error)
                )
              );

              return;
            }


            resolve(json);

          } catch {

            reject(
              new Error(
                "Telangana GIS returned invalid JSON."
              )
            );
          }

        });
      }
    );


    req.on("error", reject);

    req.write(body);

    req.end();

  });
}


// =====================================================
// CLEAN
// =====================================================

function clean(value) {

  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");

}


// =====================================================
// NORMALIZE
// =====================================================

function normalize(value) {

  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[–—-]/g, "")
    .replace(/[^a-z0-9]/g, "");

}


// =====================================================
// DISTRICT ALIASES
// =====================================================

function canonicalDistrict(name) {

  const key =
    normalize(name);

  const aliases = {

    hanumakonda:
      "Hanamkonda",

    kumurambheemasifabad:
      "Komaram Bheem Asifabad",

    komarambheemasifabad:
      "Komaram Bheem Asifabad",

    medchalmalkajgiri:
      "Medchal–Malkajgiri",

  };


  return (
    aliases[key] ||
    clean(name)
  );

}


// =====================================================
// MAIN
// =====================================================

async function main() {

  let connection;


  try {

    console.log("");
    console.log("====================================");
    console.log("TELANGANA MANDAL IMPORT");
    console.log("====================================");
    console.log("");


    // =================================================
    // MYSQL CONNECTION
    // =================================================

    connection =
      await mysql.createConnection({

        host:
          process.env.DB_HOST ||
          "localhost",

        user:
          process.env.DB_USER ||
          "root",

        password:
          process.env.DB_PASSWORD ||
          "",

        database:
          process.env.DB_NAME ||
          "smart_waste_management",

        port:
          Number(
            process.env.DB_PORT ||
            3306
          ),

      });


    console.log(
      "Connected to MySQL."
    );


    // =================================================
    // LOAD DISTRICTS
    // =================================================

    const [districtRows] =
      await connection.execute(
        `
        SELECT
          district_id,
          district_name
        FROM districts
        `
      );


    const districtMap =
      new Map();


    for (const row of districtRows) {

      districtMap.set(
        normalize(
          row.district_name
        ),
        row.district_id
      );

    }


    console.log(
      `Loaded ${districtRows.length} districts.`
    );


    // =================================================
    // LOAD EXISTING REVENUE DIVISIONS
    // =================================================

    const [divisionRows] =
      await connection.execute(
        `
        SELECT
          division_id,
          division_name,
          district_id
        FROM revenue_divisions
        `
      );


    const divisionMap =
      new Map();


    for (const row of divisionRows) {

      const key =
        `${row.district_id}|${normalize(
          row.division_name
        )}`;


      divisionMap.set(
        key,
        row.division_id
      );

    }


    console.log(
      `Loaded ${divisionRows.length} revenue divisions.`
    );


    // =================================================
    // LOAD EXISTING MANDALS
    // =================================================

    const [mandalRows] =
      await connection.execute(
        `
        SELECT
          m.mandal_id,
          m.mandal_name,
          m.division_id,
          rd.district_id
        FROM mandals m
        JOIN revenue_divisions rd
          ON m.division_id =
             rd.division_id
        `
      );


    const mandalMap =
      new Map();


    for (const row of mandalRows) {

      const key =
        `${row.district_id}|${normalize(
          row.mandal_name
        )}`;


      mandalMap.set(
        key,
        row.mandal_id
      );

    }


    console.log(
      `Loaded ${mandalRows.length} mandals.`
    );


    // =================================================
    // GET GIS OBJECT IDS
    // =================================================

    console.log("");
    console.log(
      "Requesting Telangana Mandal IDs..."
    );


    const idData =
      await postJson(
        QUERY_URL,
        {
          where: "1=1",
          returnIdsOnly: "true",
          f: "json",
        }
      );


    if (
      !idData.objectIds ||
      !Array.isArray(
        idData.objectIds
      )
    ) {

      throw new Error(
        "Telangana GIS did not return Mandal Object IDs."
      );

    }


    const objectIds =
      idData.objectIds.sort(
        (a, b) => a - b
      );


    console.log(
      `Total GIS Mandal records: ${objectIds.length}`
    );


    // =================================================
    // COUNTERS
    // =================================================

    let inserted = 0;
    let skipped = 0;
    let divisionsCreated = 0;


    await connection.beginTransaction();


    // =================================================
    // PROCESS BATCHES
    // =================================================

    for (
      let i = 0;
      i < objectIds.length;
      i += BATCH_SIZE
    ) {

      const batch =
        objectIds.slice(
          i,
          i + BATCH_SIZE
        );


      console.log("");

      console.log(
        `Fetching records ${i + 1} - ${
          i + batch.length
        }...`
      );


      const data =
        await postJson(
          QUERY_URL,
          {
            objectIds:
              batch.join(","),

            outFields:
              "objectid,mandal,district,revenue_division",

            returnGeometry:
              "false",

            f:
              "json",
          }
        );


      const features =
        data.features || [];


      console.log(
        `Received ${features.length} records.`
      );


      for (
        const feature
        of features
      ) {

        const attrs =
          feature.attributes || {};


        const mandalName =
          clean(attrs.mandal);

        const districtName =
          canonicalDistrict(
            attrs.district
          );

        const divisionName =
          clean(
            attrs.revenue_division
          );


        if (
          !mandalName ||
          !districtName ||
          !divisionName
        ) {

          skipped++;

          continue;
        }


        // ===========================================
        // FIND DISTRICT
        // ===========================================

        const districtId =
          districtMap.get(
            normalize(
              districtName
            )
          );


        if (!districtId) {

          console.log(
            `District not found:
${districtName}`
          );

          skipped++;

          continue;
        }


        // ===========================================
        // FIND / CREATE REVENUE DIVISION
        // ===========================================

        const divisionKey =
          `${districtId}|${normalize(
            divisionName
          )}`;


        let divisionId =
          divisionMap.get(
            divisionKey
          );


        if (!divisionId) {

          try {

            const [
              result
            ] =
              await connection.execute(
                `
                INSERT INTO revenue_divisions
                (
                  division_name,
                  district_id
                )
                VALUES (?, ?)
                `,
                [
                  divisionName,
                  districtId,
                ]
              );


            divisionId =
              result.insertId;


            divisionMap.set(
              divisionKey,
              divisionId
            );


            divisionsCreated++;


            console.log(
              `Created division:
${divisionName}
→ ${districtName}`
            );


          } catch (error) {

            if (
              error.code ===
              "ER_DUP_ENTRY"
            ) {

              const [
                existing
              ] =
                await connection.execute(
                  `
                  SELECT
                    division_id
                  FROM revenue_divisions
                  WHERE
                    district_id = ?

                    AND LOWER(
                      TRIM(
                        division_name
                      )
                    )
                    =
                    LOWER(
                      TRIM(?)
                    )

                  LIMIT 1
                  `,
                  [
                    districtId,
                    divisionName,
                  ]
                );


              if (
                existing.length === 0
              ) {

                throw error;
              }


              divisionId =
                existing[0]
                  .division_id;


              divisionMap.set(
                divisionKey,
                divisionId
              );

            } else {

              throw error;

            }

          }
        }


        // ===========================================
        // FIND MANDAL
        // ===========================================

        const mandalKey =
          `${districtId}|${normalize(
            mandalName
          )}`;


        const existingMandal =
          mandalMap.get(
            mandalKey
          );


        if (existingMandal) {

          skipped++;

          continue;
        }


        // ===========================================
        // INSERT MANDAL
        // ===========================================

        try {

          const [
            result
          ] =
            await connection.execute(
              `
              INSERT INTO mandals
              (
                mandal_name,
                division_id
              )
              VALUES (?, ?)
              `,
              [
                mandalName,
                divisionId,
              ]
            );


          mandalMap.set(
            mandalKey,
            result.insertId
          );


          inserted++;

        } catch (error) {

          if (
            error.code ===
            "ER_DUP_ENTRY"
          ) {

            // It already exists;
            // refresh the map.

            const [
              existing
            ] =
              await connection.execute(
                `
                SELECT
                  m.mandal_id
                FROM mandals m
                JOIN revenue_divisions rd
                  ON m.division_id =
                     rd.division_id
                WHERE
                  rd.district_id = ?

                  AND LOWER(
                    TRIM(
                      m.mandal_name
                    )
                  )
                  =
                  LOWER(
                    TRIM(?)
                  )

                LIMIT 1
                `,
                [
                  districtId,
                  mandalName,
                ]
              );


            if (
              existing.length > 0
            ) {

              mandalMap.set(
                mandalKey,
                existing[0]
                  .mandal_id
              );

              skipped++;

            } else {

              throw error;
            }

          } else {

            throw error;

          }
        }

      }
    }


    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();


    // =================================================
    // SUMMARY
    // =================================================

    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      "MANDAL IMPORT COMPLETED"
    );

    console.log(
      "===================================="
    );

    console.log(
      `Total GIS Records : ${objectIds.length}`
    );

    console.log(
      `Inserted Mandals  : ${inserted}`
    );

    console.log(
      `Skipped Existing  : ${skipped}`
    );

    console.log(
      `Divisions Created : ${divisionsCreated}`
    );

    console.log(
      "===================================="
    );

    console.log("");

  } catch (error) {

    if (connection) {

      await connection.rollback();

    }


    console.error("");

    console.error(
      "Mandal import failed:"
    );

    console.error(
      error.message
    );

    console.error("");

    process.exitCode = 1;

  } finally {

    if (connection) {

      await connection.end();

    }

  }

}


// =====================================================
// START
// =====================================================

main();