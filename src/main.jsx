import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login, { clearAuth } from "./Login.jsx";

function Root() {
  const [user, setUser] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("myday_auth_v1"));
      return stored?.username || null;
    } catch { return null; }
  });

  if (!user) return <Login onLogin={setUser} />;
  return <App username={user} onLogout={() => { clearAuth(); setUser(null); }} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
