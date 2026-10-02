import {
  useMemo,
  useState,
} from "react";

import {
  BarChart3,
  CalendarDays,
  Download,
  Leaf,
  MapPin,
  Printer,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import {
  useOutletContext,
} from "react-router-dom";

import "../styles/ReportsAnalytics.css";


/* =========================================================
   DUMPED REPORT DATA
========================================================= */

const REPORT_DATA = {

  "7d": {
    grouping: "day",

    waste: [
      {
        label: "22 Sep",
        value: 820,
      },
      {
        label: "23 Sep",
        value: 940,
      },
      {
        label: "24 Sep",
        value: 760,
      },
      {
        label: "25 Sep",
        value: 1080,
      },
      {
        label: "26 Sep",
        value: 920,
      },
      {
        label: "27 Sep",
        value: 1180,
      },
      {
        label: "28 Sep",
        value: 1050,
      },
    ],

    efficiency: [
      {
        label: "Mon",
        value: 32,
      },
      {
        label: "Tue",
        value: 25,
      },
      {
        label: "Wed",
        value: 25,
      },
      {
        label: "Thu",
        value: 50,
      },
      {
        label: "Fri",
        value: 0,
      },
      {
        label: "Sat",
        value: 27,
      },
      {
        label: "Sun",
        value: 32,
      },
    ],

    totalWaste: 6750,
    activeZones: 12,
    averageLevel: 63.1,
    collectionEfficiency: 32.1,
    collectionsCompleted: 18,
    totalRequests: 56,
  },


  "30d": {
    grouping: "week",

    waste: [
      {
        label: "Week 1",
        value: 3520,
      },
      {
        label: "Week 2",
        value: 4180,
      },
      {
        label: "Week 3",
        value: 4760,
      },
      {
        label: "Week 4",
        value: 5320,
      },
      {
        label: "Week 5",
        value: 4180,
      },
    ],

    efficiency: [
      {
        label: "Week 1",
        value: 28,
      },
      {
        label: "Week 2",
        value: 35,
      },
      {
        label: "Week 3",
        value: 31,
      },
      {
        label: "Week 4",
        value: 42,
      },
      {
        label: "Week 5",
        value: 38,
      },
    ],

    totalWaste: 21960,
    activeZones: 18,
    averageLevel: 61.4,
    collectionEfficiency: 38.4,
    collectionsCompleted: 54,
    totalRequests: 141,
  },


  "2m": {
    grouping: "month",

    waste: [
      {
        label: "Aug",
        value: 9840,
      },
      {
        label: "Sep",
        value: 11280,
      },
    ],

    efficiency: [
      {
        label: "Aug",
        value: 76,
      },
      {
        label: "Sep",
        value: 83,
      },
    ],

    totalWaste: 21120,
    activeZones: 31,
    averageLevel: 69.2,
    collectionEfficiency: 79.4,
    collectionsCompleted: 138,
    totalRequests: 174,
  },


  "3m": {
    grouping: "month",

    waste: [
      {
        label: "Jul",
        value: 10920,
      },
      {
        label: "Aug",
        value: 11840,
      },
      {
        label: "Sep",
        value: 16740,
      },
    ],

    efficiency: [
      {
        label: "Jul",
        value: 76,
      },
      {
        label: "Aug",
        value: 79,
      },
      {
        label: "Sep",
        value: 83,
      },
    ],

    totalWaste: 39500,
    activeZones: 42,
    averageLevel: 72.4,
    collectionEfficiency: 79.2,
    collectionsCompleted: 312,
    totalRequests: 394,
  },


  "4m": {
    grouping: "month",

    waste: [
      {
        label: "Jun",
        value: 10120,
      },
      {
        label: "Jul",
        value: 10920,
      },
      {
        label: "Aug",
        value: 11840,
      },
      {
        label: "Sep",
        value: 16740,
      },
    ],

    efficiency: [
      {
        label: "Jun",
        value: 73,
      },
      {
        label: "Jul",
        value: 76,
      },
      {
        label: "Aug",
        value: 79,
      },
      {
        label: "Sep",
        value: 83,
      },
    ],

    totalWaste: 49620,
    activeZones: 48,
    averageLevel: 70.8,
    collectionEfficiency: 78.2,
    collectionsCompleted: 396,
    totalRequests: 506,
  },


  "5m": {
    grouping: "month",

    waste: [
      {
        label: "May",
        value: 9860,
      },
      {
        label: "Jun",
        value: 10120,
      },
      {
        label: "Jul",
        value: 10920,
      },
      {
        label: "Aug",
        value: 11840,
      },
      {
        label: "Sep",
        value: 16740,
      },
    ],

    efficiency: [
      {
        label: "May",
        value: 71,
      },
      {
        label: "Jun",
        value: 73,
      },
      {
        label: "Jul",
        value: 76,
      },
      {
        label: "Aug",
        value: 79,
      },
      {
        label: "Sep",
        value: 83,
      },
    ],

    totalWaste: 59480,
    activeZones: 52,
    averageLevel: 71.6,
    collectionEfficiency: 76.8,
    collectionsCompleted: 482,
    totalRequests: 628,
  },


  "6m": {
    grouping: "month",

    waste: [
      {
        label: "Apr",
        value: 9120,
      },
      {
        label: "May",
        value: 9860,
      },
      {
        label: "Jun",
        value: 10120,
      },
      {
        label: "Jul",
        value: 10920,
      },
      {
        label: "Aug",
        value: 11840,
      },
      {
        label: "Sep",
        value: 16740,
      },
    ],

    efficiency: [
      {
        label: "Apr",
        value: 68,
      },
      {
        label: "May",
        value: 71,
      },
      {
        label: "Jun",
        value: 73,
      },
      {
        label: "Jul",
        value: 76,
      },
      {
        label: "Aug",
        value: 79,
      },
      {
        label: "Sep",
        value: 83,
      },
    ],

    totalWaste: 68600,
    activeZones: 58,
    averageLevel: 72.3,
    collectionEfficiency: 75.4,
    collectionsCompleted: 574,
    totalRequests: 761,
  },

};


const RANGE_OPTIONS = [
  {
    value: "7d",
    label: "Last 7 days",
  },
  {
    value: "30d",
    label: "Last 30 days",
  },
  {
    value: "2m",
    label: "Last 2 months",
  },
  {
    value: "3m",
    label: "Last 3 months",
  },
  {
    value: "4m",
    label: "Last 4 months",
  },
  {
    value: "5m",
    label: "Last 5 months",
  },
  {
    value: "6m",
    label: "Last 6 months",
  },
];


function formatNumber(value) {

  return Number(value || 0)
    .toLocaleString("en-IN");
}


function formatKg(value) {

  return `${formatNumber(value)} kg`;
}


function formatPercent(value) {

  return `${Number(value || 0).toFixed(1)}%`;
}


/* =========================================================
   COMPONENT
========================================================= */

function ReportsAnalytics() {

  const {
    districtId,
    districtName,
    localityName,
  } = useOutletContext();


  const [
    selectedRange,
    setSelectedRange,
  ] = useState("5m");


  const data =
    REPORT_DATA[selectedRange];


  /* =======================================================
     SELECTED LOCATION
  ======================================================= */

  const selectedLocation =
    localityName ||
    districtName ||
    "Selected Location";


  /* =======================================================
     CHART DATA
  ======================================================= */

  const maxWaste =
    Math.max(
      ...data.waste.map(
        (item) => item.value
      ),
      1
    );


  /* =======================================================
     SVG EFFICIENCY LINE
  ======================================================= */

  const efficiencyPoints =
    useMemo(() => {

      const width = 680;
      const height = 235;

      if (
        data.efficiency.length === 0
      ) {
        return {
          line: "",
          area: "",
          circles: [],
        };
      }


      const points =
        data.efficiency.map(
          (item, index) => {

            const x =
              data.efficiency.length === 1
                ? width / 2
                : (
                    index /
                    (
                      data.efficiency.length -
                      1
                    )
                  ) *
                    width;


            const y =
              height -
              (
                Number(item.value) /
                100
              ) *
                height;


            return {
              x,
              y,
              value: item.value,
            };

          }
        );


      const line =
        points
          .map(
            (point) =>
              `${point.x},${point.y}`
          )
          .join(" ");


      const area =
        `0,${height} ` +
        points
          .map(
            (point) =>
              `${point.x},${point.y}`
          )
          .join(" ") +
        ` ${width},${height}`;


      return {
        line,
        area,
        circles: points,
      };

    }, [data.efficiency]);


  /* =======================================================
     EXPORT
  ======================================================= */

  const exportCsv = () => {

    const rows = [
      [
        "Period",
        "Waste (kg)",
        "Collection Efficiency (%)",
      ],

      ...data.waste.map(
        (item, index) => [
          item.label,
          item.value,
          data.efficiency[index]
            ?.value || 0,
        ]
      ),
    ];


    const csv =
      rows
        .map(
          (row) =>
            row
              .map(
                (value) =>
                  `"${String(value).replace(
                    /"/g,
                    '""'
                  )}"`
              )
              .join(",")
        )
        .join("\n");


    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;",
        }
      );


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement("a");


    link.href = url;

    link.download =
      `waste-report-${selectedRange}.csv`;


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };


  /* =======================================================
     NO LOCATION
  ======================================================= */

  if (!districtId) {

    return (
      <div className="reports-page">

        <div className="reports-empty-location">

          <MapPin size={32} />

          <h2>
            Select a location
          </h2>

          <p>
            Select a district or locality
            to view reports.
          </p>

        </div>

      </div>
    );
  }


  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <div className="reports-page">

      {/* HEADER */}

      <div className="reports-header">

        <div>

          <div className="reports-breadcrumb">
            Operations /
            <strong>
              reports
            </strong>
          </div>


          <div className="reports-heading-row">

            <BarChart3
              size={25}
              strokeWidth={1.8}
            />

            <div>

              <div className="reports-eyebrow">
                PERFORMANCE INTELLIGENCE
              </div>

              <h1>
                Reports
              </h1>

              <p>
                Historical waste and
                collection performance
                for the selected location.
              </p>

            </div>

          </div>

        </div>


        <div className="reports-header-actions">

          <button
            type="button"
            className="report-outline-button"
            onClick={exportCsv}
          >

            <Download size={17} />

            Export CSV

          </button>


          <button
            type="button"
            className="report-primary-button"
            onClick={() =>
              window.print()
            }
          >

            <Printer size={17} />

            Print report

          </button>

        </div>

      </div>


      {/* CONTROLS */}

      <div className="reports-controls">

        <div className="reports-range-wrapper">

          <CalendarDays
            size={17}
          />

          <select
            value={selectedRange}
            onChange={(event) =>
              setSelectedRange(
                event.target.value
              )
            }
          >

            {RANGE_OPTIONS.map(
              (option) => (

                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>

              )
            )}

          </select>

        </div>


        <button
          type="button"
          className="generate-button"
        >

          <RefreshCw
            size={17}
          />

          Generate report

        </button>


        <div className="reports-scope">

          <MapPin
            size={16}
          />

          <span>
            {selectedLocation}
          </span>

        </div>

      </div>


      {/* LOCATION STRIP */}

      <div className="reports-live-strip">

        <span className="live-dot"></span>

        <span>
          Report dataset
        </span>

        <span className="live-divider">
          •
        </span>

        <span>
          {selectedLocation}
        </span>

        <span className="live-divider">
          •
        </span>

        <span>
          {RANGE_OPTIONS.find(
            (item) =>
              item.value ===
              selectedRange
          )?.label}
        </span>

      </div>


      {/* KPI CARDS */}

      <section className="reports-kpi-grid">

        <div className="reports-kpi-card">

          <div className="kpi-label">
            WASTE RECORDED
          </div>

          <div className="kpi-value">
            {formatKg(
              data.totalWaste
            )}
          </div>

          <div className="kpi-note">
            Historical report dataset
          </div>

          <div className="kpi-icon green">
            <Leaf size={20} />
          </div>

        </div>


        <div className="reports-kpi-card">

          <div className="kpi-label">
            ACTIVE ZONES
          </div>

          <div className="kpi-value">
            {formatNumber(
              data.activeZones
            )}
          </div>

          <div className="kpi-note">
            Zones in selected location
          </div>

          <div className="kpi-icon orange">
            <MapPin size={20} />
          </div>

        </div>


        <div className="reports-kpi-card">

          <div className="kpi-label">
            AVG. BIN LEVEL
          </div>

          <div className="kpi-value">
            {formatPercent(
              data.averageLevel
            )}
          </div>

          <div className="kpi-note">
            Average recorded fill level
          </div>

          <div className="kpi-icon yellow">
            <TrendingUp size={20} />
          </div>

        </div>


        <div className="reports-kpi-card">

          <div className="kpi-label">
            COLLECTION EFFICIENCY
          </div>

          <div className="kpi-value">
            {formatPercent(
              data.collectionEfficiency
            )}
          </div>

          <div className="kpi-note">
            Completed / total requests
          </div>

          <div className="kpi-icon teal">
            <BarChart3 size={20} />
          </div>

        </div>

      </section>


      {/* MAIN CHARTS */}

      <section className="reports-chart-grid">


        {/* WASTE CHART */}

        <div className="reports-panel">

          <div className="reports-panel-header">

            <div>

              <h2>
                Waste collected by{" "}
                {data.grouping}
              </h2>

              <p>
                Historical waste volume for{" "}
                <strong>
                  {selectedLocation}
                </strong>
              </p>

            </div>

            <span className="panel-unit">
              EST. WASTE (KG)
            </span>

          </div>


          <div className="bar-chart-container">

            <div className="bar-y-axis">

              <span>
                {formatNumber(
                  maxWaste
                )}
              </span>

              <span>
                {formatNumber(
                  maxWaste * 0.75
                )}
              </span>

              <span>
                {formatNumber(
                  maxWaste * 0.5
                )}
              </span>

              <span>
                {formatNumber(
                  maxWaste * 0.25
                )}
              </span>

              <span>
                0
              </span>

            </div>


            <div className="bar-chart-body">

              <div className="bar-grid-lines">

                <span />
                <span />
                <span />
                <span />
                <span />

              </div>


              <div className="bars">

                {data.waste.map(
                  (item) => {

                    const height =
                      (
                        item.value /
                        maxWaste
                      ) *
                      100;


                    return (

                      <div
                        className="bar-item"
                        key={item.label}
                      >

                        <div
                          className="bar-value"
                          style={{
                            height:
                              `${height}%`,
                          }}
                        >

                          <span className="bar-value-label">
                            {formatNumber(
                              item.value
                            )}
                          </span>

                        </div>


                        <div className="bar-label">
                          {item.label}
                        </div>

                      </div>

                    );

                  }
                )}

              </div>

            </div>

          </div>

        </div>


        {/* EFFICIENCY CHART */}

        <div className="reports-panel">

          <div className="reports-panel-header">

            <div>

              <h2>
                Collection efficiency
              </h2>

              <p>
                Completion rate across the
                selected period
              </p>

            </div>

            <span className="panel-unit">
              COMPLETED / REQUESTS
            </span>

          </div>


          <div className="efficiency-chart">

            <div className="efficiency-y-axis">

              <span>
                100%
              </span>

              <span>
                75%
              </span>

              <span>
                50%
              </span>

              <span>
                25%
              </span>

              <span>
                0%
              </span>

            </div>


            <div className="efficiency-body">

              <div className="efficiency-grid">

                <span />
                <span />
                <span />
                <span />
                <span />

              </div>


              <svg
                className="efficiency-svg"
                viewBox="0 0 680 235"
                preserveAspectRatio="none"
              >

                {/* PEACH FILLED AREA */}

                <polygon
                  points={
                    efficiencyPoints.area
                  }
                  fill="rgba(232,137,67,0.12)"
                  stroke="none"
                />


                {/* ORANGE LINE */}

                <polyline
                  points={
                    efficiencyPoints.line
                  }
                  fill="none"
                  stroke="#e88943"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />


                {/* POINTS */}

                {efficiencyPoints.circles.map(
                  (point, index) => (

                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      fill="#e88943"
                    />

                  )
                )}

              </svg>


              <div className="efficiency-labels">

                {data.efficiency.map(
                  (item) => (

                    <span
                      key={item.label}
                    >
                      {item.label}
                    </span>

                  )
                )}

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* OPERATIONAL SUMMARY */}

      <section className="reports-panel operational-panel">

        <div className="reports-panel-header">

          <div>

            <h2>
              Operational summary
            </h2>

            <p>
              Insights from the selected
              report dataset for{" "}
              <strong>
                {selectedLocation}
              </strong>
            </p>

          </div>

        </div>


        <div className="operational-grid">


          {/* CARD 1 */}

          <div className="operational-card">

            <span>
              HIGHEST VOLUME ZONE
            </span>

            <strong>
              {selectedLocation}
            </strong>

            <small>
              {formatKg(
                data.totalWaste
              )}{" "}
              recorded
            </small>

          </div>


          {/* CARD 2 */}

          <div className="operational-card">

            <span>
              MOST RELIABLE ROUTE
            </span>

            <strong>
              {selectedLocation}
            </strong>

            <small>
              {formatPercent(
                data.collectionEfficiency
              )}{" "}
              on time
            </small>

          </div>


          {/* CARD 3 */}

          <div className="operational-card">

            <span>
              NEXT IMPROVEMENT
            </span>

            <strong>
              {selectedLocation}
            </strong>

            <small>
              Review pickup frequency
            </small>

          </div>


        </div>

      </section>


      {/* FOOTER */}

      <div className="reports-footer-info">

        <span>
          Showing{" "}
          {
            RANGE_OPTIONS.find(
              (item) =>
                item.value ===
                selectedRange
            )?.label
          }
        </span>

        <span>
          Grouped{" "}
          {
            data.grouping === "day"
              ? "day-wise"
              : data.grouping === "week"
                ? "week-wise"
                : "month-wise"
          }
        </span>

        <span>
          Static report dataset
        </span>

      </div>

    </div>
  );
}


export default ReportsAnalytics;