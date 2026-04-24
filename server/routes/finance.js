import express from "express";
import db from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM finance_items WHERE user_id = ? ORDER BY date DESC").all(req.user.id);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { id, date, type, amount, label, cat } = req.body;
  db.prepare(`INSERT OR REPLACE INTO finance_items (id, user_id, date, type, amount, label, cat)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, date, type, amount, label, cat || "other");
  res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM finance_items WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
