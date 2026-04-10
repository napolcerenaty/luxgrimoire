import { useState, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./UserPages.css";

const TIMEZONE_GROUPS = [
  { group: "Europa", zones: [
    "Europe/Warsaw","Europe/London","Europe/Paris","Europe/Berlin","Europe/Rome",
    "Europe/Madrid","Europe/Amsterdam","Europe/Brussels","Europe/Vienna","Europe/Prague",
    "Europe/Budapest","Europe/Bucharest","Europe/Sofia","Europe/Athens","Europe/Helsinki",
    "Europe/Stockholm","Europe/Oslo","Europe/Copenhagen","Europe/Zurich","Europe/Lisbon",
    "Europe/Kiev","Europe/Moscow","Europe/Istanbul",
  ]},
  { group: "Ameryka", zones: [
    "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
    "America/Anchorage","America/Honolulu","America/Toronto","America/Vancouver",
    "America/Mexico_City","America/Sao_Paulo","America/Argentina/Buenos_Aires","America/Bogota",
  ]},
  { group: "Azja / Pacyfik", zones: [
    "Asia/Tokyo","Asia/Seoul","Asia/Shanghai","Asia/Hong_Kong","Asia/Singapore",
    "Asia/Bangkok","Asia/Dubai","Asia/Kolkata","Asia/Karachi","Asia/Dhaka",
    "Asia/Jakarta","Asia/Taipei","Australia/Sydney","Australia/Melbourne","Pacific/Auckland",
  ]},
  { group: "Afryka / Inne", zones: [
    "Africa/Cairo","Africa/Johannesburg","Africa/Lagos","Africa/Nairobi",
    "Atlantic/Reykjavik","UTC",
  ]},
];

function getGmtOffset(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export default function SettingsPage({ onBack }) {
  const { user, updateSettings } = useAuth();
  const { t } = useI18n();
  const [timezone, setTimezone] = useState(
    user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [saved, setSaved]   = useState(false);

  const gmtOffsets = useMemo(() => {
    const map = {};
    TIMEZONE_GROUPS.forEach(({ zones }) =>
      zones.forEach((tz) => { map[tz] = getGmtOffset(tz); })
    );
    return map;
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings(timezone);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const label = (tz) => {
    const name   = tz.replace(/_/g, " ");
    const offset = gmtOffsets[tz] ?? "";
    return offset ? `${name}  (${offset})` : name;
  };

  return (
    <div className="user-page">
      <button className="back-btn" onClick={onBack}>{t("back")}</button>

      <div className="user-page-card">
        <h2 className="user-page-title">{t("settings.title")}</h2>

        <div className="user-page-form">
          <label>
            {t("settings.timezone")}
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONE_GROUPS.map(({ group, zones }) => (
                <optgroup key={group} label={group}>
                  {zones.map((tz) => (
                    <option key={tz} value={tz}>{label(tz)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="field-hint">
              {t("settings.browserTz", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}
            </span>
          </label>

          {error && <p className="page-error">{error}</p>}
          {saved && <p className="page-success">{t("settings.saved")}</p>}

          <button className="page-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? t("settings.saving") : t("settings.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
