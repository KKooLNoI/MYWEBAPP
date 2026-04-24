import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { getToken, clearToken, api } from "./api.js";

function Root() {
  const [user, setUser] = useState(() => {
    // Check if we have a stored token and extract username from it
    const token = getToken();
    if (!token) return null;
    try {
      // Decode JWT payload (no verification - just to get username for display)
      const payload = JSON.parse(atob(token.split(".")[1]));
      // Check expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearToken();
        return null;
      }
      return payload.username || null;
    } catch {
      clearToken();
      return null;
    }
  });

  const handleLogin = (username) => setUser(username);
  const handleLogout = () => { clearToken(); setUser(null); };

  if (!user) return <Login onLogin={handleLogin} />;
  return <App username={user} onLogout={handleLogout} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
