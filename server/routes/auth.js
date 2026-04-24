import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { SECRET, verifyToken } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: "กรุณาใส่ชื่อผู้ใช้" });
  if (!password || password.length < 4) return res.status(400).json({ error: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" });

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username.trim(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username: username.trim() }, SECRET, { expiresIn: "30d" });
    res.json({ token, username: username.trim() });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" });
    res.status(500).json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username?.trim() || "");
  if (!user) return res.status(400).json({ error: "ไม่พบชื่อผู้ใช้นี้" });
  const ok = await bcrypt.compare(password || "", user.password_hash);
  if (!ok) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: "30d" });
  res.json({ token, username: user.username });
});

router.get("/me", verifyToken, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

export default router;
