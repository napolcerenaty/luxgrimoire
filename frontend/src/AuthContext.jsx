import { createContext, useContext, useState, useEffect } from "react";
import { API } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in

  useEffect(() => {
    fetch(API.AUTH_ME, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const login = async (email, password) => {
    const r = await fetch(API.AUTH_LOGIN, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Login failed");
    setUser(data);
    return data;
  };

  const logout = async () => {
    await fetch(API.AUTH_LOGOUT, { method: "POST", credentials: "include" });
    setUser(null);
  };

  const updateProfile = async (firstName, lastName, timezone) => {
    const body = { firstName, lastName };
    if (timezone !== undefined) body.timezone = timezone;
    const r = await fetch(API.AUTH_PROFILE, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Update failed");
    setUser(data);
    return data;
  };

  const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch(API.AUTH_AVATAR, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Upload failed");
    setUser(data);
    return data;
  };

  const updateSettings = async (timezone) => {
    const r = await fetch(API.AUTH_SETTINGS, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Update failed");
    setUser(data);
    return data;
  };

  const updatePrivacy = async (changes) => {
    const r = await fetch(API.USER_PRIVACY, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Update failed");
    setUser(data);
    return data;
  };

  const updateSocial = async (fields) => {
    const r = await fetch(API.USER_SOCIAL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Update failed");
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile, updateSettings, uploadAvatar, updatePrivacy, updateSocial }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
