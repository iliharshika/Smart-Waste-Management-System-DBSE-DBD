const https = require("https");
const mysql = require("mysql2/promise");
require("dotenv").config();


// =====================================================
// TELANGANA GIS VILLAGE LAYER
// =====================================================

const QUERY_URL =
  "https://tgrac.telangana.gov.in/arcgis/rest/services/" +
  "Master_Administrative_Folder/" +
  "Master_Administrative_Boundary_test/" +
  "FeatureServer/5/query";

const BATCH_SIZE = 500;


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


    const urlObject =
      new URL(url);


    const options = {

      hostname:
        urlObject.hostname,

      path:
        urlObject.pathname,

      method:
        "POST",

      agent:
        httpsAgent,

      headers: {

        "Content-Type":
          "application/x-www-form-urlencoded",

        "Content-Length":
          Buffer.byteLength(body),
      },
    };


    const req =
      https.request(
        options,
        (res) => {

          let data = "";


          res.on(
            "data",
            (chunk) => {
              data += chunk;
            }
          );


          res.on(
            "end",
            () => {

              if (
                res.statusCode !== 200
              ) {

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
                      JSON.stringify(
                        json.error
                      )
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

            }
          );

        }
      );


    req.on(
      "error",
      reject
    );


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

    console.log(
      "===================================="
    );

    console.log(
      "TELANGANA VILLAGE IMPORT"
    );

    console.log(
      "===================================="
    );

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


    for (
      const row
      of districtRows
    ) {

      districtMap.set(
        normalize(
          row.district_name
        ),

        row.district_id
      );

    }


    // =================================================
    // LOAD REVENUE DIVISIONS
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


    for (
      const row
      of divisionRows
    ) {

      const key =
        `${row.district_id}|${normalize(
          row.division_name
        )}`;


      divisionMap.set(
        key,
        row.division_id
      );

    }


    // =================================================
    // LOAD MANDALS
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


    for (
      const row
      of mandalRows
    ) {

      const key =
        `${row.district_id}|${normalize(
          row.mandal_name
        )}`;


      mandalMap.set(
        key,
        {
          mandalId:
            row.mandal_id,

          districtId:
            row.district_id,

          divisionId:
            row.division_id,
        }
      );

    }


    console.log(
      `Loaded ${mandalRows.length} Mandals.`
    );


    // =================================================
    // GET GIS VILLAGE OBJECT IDS
    // =================================================

    console.log("");

    console.log(
      "Requesting Telangana village IDs..."
    );


    const idData =
      await postJson(
        QUERY_URL,
        {
          where:
            "1=1",

          returnIdsOnly:
            "true",

          f:
            "json",
        }
      );


    if (
      !idData.objectIds ||
      !Array.isArray(
        idData.objectIds
      )
    ) {

      throw new Error(
        "Telangana GIS did not return village Object IDs."
      );

    }


    const objectIds =
      idData.objectIds.sort(
        (a, b) => a - b
      );


    console.log(
      `Total GIS village records: ${objectIds.length}`
    );


    // =================================================
    // COUNTERS
    // =================================================

    let inserted = 0;

    let skipped = 0;

    let mandalsCreated = 0;

    let divisionsCreated = 0;

    let unmatchedDistricts = 0;


    const unmatchedRecords = [];


    await connection.beginTransaction();


    // =================================================
    // PROCESS GIS VILLAGES
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
              "objectid,village,mandal,district,revenue_division",

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


      // =================================================
      // PROCESS EACH VILLAGE
      // =================================================

      for (
        const feature
        of features
      ) {

        const attrs =
          feature.attributes || {};


        const villageName =
          clean(
            attrs.village
          );


        const mandalName =
          clean(
            attrs.mandal
          );


        const districtName =
          canonicalDistrict(
            attrs.district
          );


        const divisionName =
          clean(
            attrs.revenue_division
          );


        if (
          !villageName ||
          !mandalName ||
          !districtName
        ) {

          skipped++;

          continue;
        }


        // =============================================
        // FIND DISTRICT
        // =============================================

        const districtId =
          districtMap.get(
            normalize(
              districtName
            )
          );


        if (!districtId) {

          unmatchedDistricts++;


          unmatchedRecords.push({

            district:
              districtName,

            mandal:
              mandalName,

            village:
              villageName,

          });


          continue;
        }


        // =============================================
        // FIND MANDAL
        // =============================================

        const mandalKey =
          `${districtId}|${normalize(
            mandalName
          )}`;


        let mandal =
          mandalMap.get(
            mandalKey
          );


        // =============================================
        // CREATE MISSING MANDAL
        // =============================================

        if (!mandal) {

          // -------------------------------------------
          // Revenue Division must be available
          // -------------------------------------------

          if (!divisionName) {

            unmatchedRecords.push({

              district:
                districtName,

              mandal:
                mandalName,

              village:
                villageName,

            });


            continue;
          }


          // -------------------------------------------
          // FIND / CREATE DIVISION
          // -------------------------------------------

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


          // -------------------------------------------
          // CREATE MANDAL
          // -------------------------------------------

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


            mandal = {

              mandalId:
                result.insertId,

              districtId:
                districtId,

              divisionId:
                divisionId,

            };


            mandalMap.set(
              mandalKey,
              mandal
            );


            mandalsCreated++;


            console.log(
              `Created mandal:
${mandalName}
→ ${divisionName}
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
                    m.mandal_id,
                    m.division_id
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
                existing.length === 0
              ) {

                throw error;
              }


              mandal = {

                mandalId:
                  existing[0]
                    .mandal_id,

                districtId:
                  districtId,

                divisionId:
                  existing[0]
                    .division_id,

              };


              mandalMap.set(
                mandalKey,
                mandal
              );


            } else {

              throw error;
            }

          }

        }


        // =============================================
        // CHECK EXISTING VILLAGE
        // =============================================

        const [
          existingRows
        ] =
          await connection.execute(
            `
            SELECT
              locality_id
            FROM localities
            WHERE
              LOWER(
                TRIM(
                  locality_name
                )
              )
              =
              LOWER(
                TRIM(?)
              )

              AND mandal_id = ?

            LIMIT 1
            `,
            [
              villageName,
              mandal.mandalId,
            ]
          );


        if (
          existingRows.length > 0
        ) {

          skipped++;

          continue;
        }


        // =============================================
        // INSERT VILLAGE
        // =============================================

        await connection.execute(
          `
          INSERT INTO localities
          (
            locality_name,
            district_id,
            mandal_id,
            place_type
          )
          VALUES
          (?, ?, ?, 'Village')
          `,
          [
            villageName,

            districtId,

            mandal.mandalId,
          ]
        );


        inserted++;

      }

    }


    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();


    // =================================================
    // FINAL OUTPUT
    // =================================================

    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      "VILLAGE IMPORT COMPLETED"
    );

    console.log(
      "===================================="
    );


    console.log(
      `Total GIS Records  : ${objectIds.length}`
    );


    console.log(
      `Inserted Villages  : ${inserted}`
    );


    console.log(
      `Skipped Existing   : ${skipped}`
    );


    console.log(
      `Mandals Created    : ${mandalsCreated}`
    );


    console.log(
      `Divisions Created  : ${divisionsCreated}`
    );


    console.log(
      `Unmatched Districts: ${unmatchedDistricts}`
    );


    console.log(
      "===================================="
    );


    if (
      unmatchedRecords.length > 0
    ) {

      console.log("");

      console.log(
        "Some records could not be matched:"
      );


      const displayLimit =
        Math.min(
          unmatchedRecords.length,
          50
        );


      for (
        let i = 0;
        i < displayLimit;
        i++
      ) {

        const record =
          unmatchedRecords[i];


        console.log(
          `${i + 1}. ${record.district} → ${record.mandal} → ${record.village}`
        );

      }


      if (
        unmatchedRecords.length > 50
      ) {

        console.log(
          `...and ${
            unmatchedRecords.length - 50
          } more.`
        );

      }

    }


    console.log("");

  } catch (error) {

    if (connection) {

      await connection.rollback();

    }


    console.error("");

    console.error(
      "Village import failed:"
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