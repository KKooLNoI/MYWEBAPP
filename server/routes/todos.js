import express from "express";
import db from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY date DESC").all(req.user.id);
  res.json(rows.map(t => ({ ...t, done: !!t.done })));
});

router.post("/", (req, res) => {
  const { id, text, note, cat, prio, date, time, done } = req.body;
  db.prepare(`INSERT OR REPLACE INTO todos (id, user_id, text, note, cat, prio, date, time, done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, text, note || "", cat || "work", prio || "medium", date, time || "", done ? 1 : 0);
  res.json({ success: true });
});

router.put("/:id", (req, res) => {
  const { text, note, cat, prio, date, time, done } = req.body;
  db.prepare(`UPDATE todos SET text=?, note=?, cat=?, prio=?, date=?, time=?, done=?
    WHERE id=? AND user_id=?`)
    .run(text, note || "", cat || "work", prio || "medium", date, time || "", done ? 1 : 0, req.params.id, req.user.id);
  res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM todos WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
