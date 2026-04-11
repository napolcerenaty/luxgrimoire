import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./UserModals.css";

export default function LoginModal({ onClose }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">{t("user.loginTitle")}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            {t("user.email")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
          </label>
          <label>
            {t("user.password")}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="modal-btn primary" disabled={loading}>
            {loading ? t("user.loggingIn") : t("user.login")}
          </button>
        </form>
      </div>
    </div>
  );
}
