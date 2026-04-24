import express from "express";
import db from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM events WHERE user_id = ? ORDER BY date, start_time").all(req.user.id);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { id, title, date, start_time, end_time, note, color } = req.body;
  db.prepare(`INSERT OR REPLACE INTO events (id, user_id, title, date, start_time, end_time, note, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, title, date, start_time || "", end_time || "", note || "", color || "#3b5eda");
  res.json({ success: true });
});

router.put("/:id", (req, res) => {
  const { title, date, start_time, end_time, note, color } = req.body;
  db.prepare(`UPDATE events SET title=?, date=?, start_time=?, end_time=?, note=?, color=?
    WHERE id=? AND user_id=?`)
    .run(title, date, start_time || "", end_time || "", note || "", color || "#3b5eda", req.params.id, req.user.id);
  res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM events WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
