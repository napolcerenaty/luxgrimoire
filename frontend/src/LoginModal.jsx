import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./UserModals.css";

export default function LoginModal({ onClose }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState("login"); // "login" | "register"

  // Login state
  const [loginEmail, setLoginEmail]       = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regUsername,  setRegUsername]    = useState("");
  const [regEmail,     setRegEmail]       = useState("");
  const [regPassword,  setRegPassword]    = useState("");
  const [regConfirm,   setRegConfirm]     = useState("");
  const [regFirstName, setRegFirstName]   = useState("");
  const [regLastName,  setRegLastName]    = useState("");

  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => { setMode(m); setError(""); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (regPassword !== regConfirm) { setError(t("user.passwordMismatch")); return; }
    if (regPassword.length < 6)     { setError(t("user.passwordTooShort")); return; }
    setLoading(true);
    try {
      const res = await fetch(API.AUTH_REGISTER, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:  regUsername,
          email:     regEmail,
          password:  regPassword,
          firstName: regFirstName,
          lastName:  regLastName,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("user.registerError")); return; }
      // Auto-login: reload auth context
      await login(regEmail, regPassword);
      onClose();
    } catch {
      setError(t("user.registerError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab${mode === "login" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("login")}
          >{t("user.login")}</button>
          <button
            className={`auth-tab${mode === "register" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("register")}
          >{t("user.register")}</button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="modal-form">
            <label>
              {t("user.email")}
              <input type="email" value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoFocus autoComplete="email" />
            </label>
            <label>
              {t("user.password")}
              <input type="password" value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password" />
            </label>
            {error && <p className="modal-error">{error}</p>}
            <button type="submit" className="modal-btn primary" disabled={loading}>
              {loading ? t("user.loggingIn") : t("user.login")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="modal-form">
            <div className="modal-form-row">
              <label>
                {t("user.firstName")}
                <input type="text" value={regFirstName}
                  onChange={(e) => setRegFirstName(e.target.value)}
                  autoFocus autoComplete="given-name" />
              </label>
              <label>
                {t("user.lastName")}
                <input type="text" value={regLastName}
                  onChange={(e) => setRegLastName(e.target.value)}
                  autoComplete="family-name" />
              </label>
            </div>
            <label>
              {t("user.username")}
              <input type="text" value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                autoComplete="username"
                placeholder={t("user.usernamePlaceholder")} />
            </label>
            <label>
              {t("user.email")}
              <input type="email" value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                autoComplete="email" />
            </label>
            <label>
              {t("user.password")}
              <input type="password" value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                autoComplete="new-password" />
            </label>
            <label>
              {t("user.confirmPassword")}
              <input type="password" value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                autoComplete="new-password" />
            </label>
            {error && <p className="modal-error">{error}</p>}
            <button type="submit" className="modal-btn primary" disabled={loading}>
              {loading ? t("user.registering") : t("user.register")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
