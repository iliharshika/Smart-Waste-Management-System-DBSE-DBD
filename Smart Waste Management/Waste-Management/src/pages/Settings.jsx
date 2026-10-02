import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Info,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/Settings.css";

const DEFAULT_SETTINGS = {
  nearFull: 60,
  critical: 80,
  refreshMinutes: 5,
  smartAssignment: true,
};

const STORAGE_KEY = "swmSettings";

function readSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null"
    );

    if (!saved) return DEFAULT_SETTINGS;

    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      nearFull: Number(saved.nearFull ?? DEFAULT_SETTINGS.nearFull),
      critical: Number(saved.critical ?? DEFAULT_SETTINGS.critical),
      refreshMinutes: Number(
        saved.refreshMinutes ?? DEFAULT_SETTINGS.refreshMinutes
      ),
      smartAssignment: saved.smartAssignment !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Settings() {
  const [settings, setSettings] = useState(readSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handleStorage = () => setSettings(readSettings());

    window.addEventListener("storage", handleStorage);
    return () =>
      window.removeEventListener("storage", handleStorage);
  }, []);

  const ranges = useMemo(() => {
    const nearFull = Math.min(
      Math.max(Number(settings.nearFull) || 0, 0),
      99
    );

    const critical = Math.min(
      Math.max(Number(settings.critical) || 1, 1),
      100
    );

    return {
      normal: `0–${Math.max(nearFull, 0)}%`,
      near: `${Math.min(nearFull + 1, 100)}–${Math.max(
        critical,
        nearFull + 1
      )}%`,
      critical: `${Math.min(critical + 1, 100)}–100%`,
    };
  }, [settings.nearFull, settings.critical]);

  const update = (key, value) => {
    setSaved(false);

    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const savePreferences = () => {
    let nearFull = Number(settings.nearFull);
    let critical = Number(settings.critical);

    if (!Number.isFinite(nearFull)) nearFull = 60;
    if (!Number.isFinite(critical)) critical = 80;

    nearFull = Math.min(Math.max(nearFull, 1), 98);
    critical = Math.min(Math.max(critical, nearFull + 1), 100);

    const next = {
      ...settings,
      nearFull,
      critical,
      refreshMinutes: Number(settings.refreshMinutes) || 5,
      smartAssignment: Boolean(settings.smartAssignment),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSettings(next);
    setSaved(true);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(next),
      })
    );

    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-heading">
          <Link to="/dashboard" className="settings-back">
            <ArrowLeft size={18} />
          </Link>

          <div className="settings-icon">
            <SettingsIcon size={24} />
          </div>

          <div>
            <div className="settings-eyebrow">
              WORKSPACE CONFIGURATION
            </div>
            <h1>Settings</h1>
            <p>
              Tune thresholds and operating defaults for the
              waste management control room.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={`settings-save ${saved ? "saved" : ""}`}
          onClick={savePreferences}
        >
          {saved ? <Check size={17} /> : <Save size={17} />}
          {saved ? "Preferences saved" : "Save preferences"}
        </button>
      </header>

      <div className="settings-grid">
        <section className="settings-card monitoring-card">
          <div className="settings-card-header">
            <div>
              <h2>Monitoring thresholds</h2>
            </div>
          </div>

          <div className="threshold-info">
            <div className="threshold-info-icon">
              <TriangleAlert size={18} />
            </div>

            <div>
              <strong>Fill level rules</strong>
              <p>
                Bins move between Normal, Near Full, and Critical
                as sensor values cross these boundaries.
              </p>
            </div>
          </div>

          <div className="threshold-form">
            <label>
              <span>Near full begins at (%)</span>
              <input
                type="number"
                min="1"
                max="98"
                value={settings.nearFull}
                onChange={(event) =>
                  update("nearFull", event.target.value)
                }
              />
            </label>

            <label>
              <span>Critical begins above (%)</span>
              <input
                type="number"
                min="2"
                max="100"
                value={settings.critical}
                onChange={(event) =>
                  update("critical", event.target.value)
                }
              />
            </label>
          </div>

          <div className="threshold-list">
            <div className="threshold-row">
              <span className="threshold-dot normal" />
              <strong>Normal</strong>
              <span>{ranges.normal}</span>
            </div>

            <div className="threshold-row">
              <span className="threshold-dot near" />
              <strong>Near full</strong>
              <span>{ranges.near}</span>
            </div>

            <div className="threshold-row">
              <span className="threshold-dot critical" />
              <strong>Critical</strong>
              <span>{ranges.critical}</span>
            </div>
          </div>
        </section>

        <section className="settings-card operational-card">
          <div className="settings-card-header">
            <div>
              <h2>Operational preferences</h2>
            </div>
          </div>

          <div className="refresh-setting">
            <label htmlFor="refreshMinutes">
              Sensor refresh interval (minutes)
            </label>

            <select
              id="refreshMinutes"
              value={settings.refreshMinutes}
              onChange={(event) =>
                update("refreshMinutes", event.target.value)
              }
            >
              <option value="1">1 minute</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </div>

          <button
            type="button"
            className={`assignment-setting ${
              settings.smartAssignment ? "enabled" : ""
            }`}
            onClick={() =>
              update(
                "smartAssignment",
                !settings.smartAssignment
              )
            }
          >
            <div>
              <strong>Smart assignment suggestions</strong>
              <span>
                Recommend available collector and vehicle pairs.
              </span>
            </div>

            <span
              className={`setting-check ${
                settings.smartAssignment ? "checked" : ""
              }`}
            >
              {settings.smartAssignment && <Check size={15} />}
            </span>
          </button>

          <div className="workspace-info">
            <ShieldCheck size={18} />

            <div>
              <strong>Local workspace</strong>
              <p>
                Your preferences are saved in this browser and
                are used by this dashboard on this device.
              </p>
            </div>
          </div>

          <div className="settings-note">
            <Info size={15} />
            <span>
              Threshold changes affect how the dashboard
              classifies bin fill levels. Smart assignment
              controls recommendation behavior only.
            </span>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <SlidersHorizontal size={15} />
        <span>
          Configuration is applied to this dashboard session
          after saving.
        </span>
      </div>
    </div>
  );
}

export default Settings;
