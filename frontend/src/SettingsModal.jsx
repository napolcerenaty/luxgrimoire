import { useState } from "react";
import { useAuth } from "./AuthContext";
import "./UserModals.css";

// All IANA timezones grouped for the selector
const TIMEZONES = [
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

export default function SettingsModal({ onClose }) {
  const { user, updateSettings } = useAuth();
  const [timezone, setTimezone] = useState(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings(timezone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Ustawienia</h2>

        <div className="modal-form">
          <label>
            Strefa czasowa
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map(({ group, zones }) => (
                <optgroup key={group} label={group}>
                  {zones.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {error && <p className="modal-error">{error}</p>}
          {saved && <p className="modal-success">✓ Strefa czasowa zapisana</p>}
          <button className="modal-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
