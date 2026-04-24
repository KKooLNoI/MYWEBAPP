import express from "express";
import cors from "cors";
import { initDB } from "./db.js";
import authRoutes from "./routes/auth.js";
import todosRoutes from "./routes/todos.js";
import financeRoutes from "./routes/finance.js";
import eventsRoutes from "./routes/events.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"], credentials: true }));
app.use(express.json());

initDB();

app.use("/api/auth", authRoutes);
app.use("/api/todos", todosRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/events", eventsRoutes);

// Forward Claude & prices API (proxy fallback)
app.use("/api/claude", async (req, res) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-04-04",
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
});

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
