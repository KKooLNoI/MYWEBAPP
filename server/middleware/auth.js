import jwt from "jsonwebtoken";

export const SECRET = process.env.JWT_SECRET || "myday_dev_secret_change_in_prod";

export function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อน" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token หมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  }
}
