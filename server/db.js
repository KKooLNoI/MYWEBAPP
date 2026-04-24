import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../data.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      note TEXT DEFAULT '',
      cat TEXT DEFAULT 'work',
      prio TEXT DEFAULT 'medium',
      date TEXT NOT NULL,
      time TEXT DEFAULT '',
      done INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS finance_items (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      label TEXT NOT NULL,
      cat TEXT DEFAULT 'other',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

export default db;
