import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import path from "path";

let db: DatabaseSync;

export function getDb() {
  if (db) return db;
  db = new DatabaseSync(path.join(app.getPath("userData"), "ats.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      reset_hash TEXT,
      reset_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS applicants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, position TEXT,
      source TEXT DEFAULT 'Email',
      stage TEXT DEFAULT 'Applied',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE, uid INTEGER, folder TEXT,
      applicant_id INTEGER REFERENCES applicants(id) ON DELETE SET NULL,
      from_addr TEXT, from_name TEXT, to_addr TEXT, subject TEXT,
      text TEXT, html TEXT, date TEXT, is_read INTEGER DEFAULT 0,
      in_reply_to TEXT, attachments TEXT DEFAULT '[]', deleted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
      title TEXT, start TEXT NOT NULL, end TEXT NOT NULL,
      platform TEXT DEFAULT 'Google Meet', link TEXT, status TEXT DEFAULT 'Scheduled'
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
      interview_id INTEGER, audio_path TEXT, transcript_path TEXT,
      status TEXT DEFAULT 'recorded', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER, stage TEXT, at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      required_skills TEXT DEFAULT '[]',
      preferred_skills TEXT DEFAULT '[]',
      min_years INTEGER DEFAULT 0,
      locations TEXT DEFAULT '[]',
      threshold INTEGER DEFAULT 60,
      auto_advance INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (userCols.includes("recovery_hash")) {
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("DROP TABLE IF EXISTS users_new");
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        reset_hash TEXT,
        reset_expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id,email,password_hash,reset_hash,reset_expires_at,created_at)
        SELECT id,email,password_hash,reset_hash,reset_expires_at,created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.exec("PRAGMA foreign_keys=ON");
  }
  // Additive migrations for databases created by earlier versions.
  const cols = (db.prepare("PRAGMA table_info(applicants)").all() as { name: string }[]).map((c) => c.name);
  const add = (name: string, def: string) => { if (!cols.includes(name)) db.exec(`ALTER TABLE applicants ADD COLUMN ${name} ${def}`); };
  add("role_id", "INTEGER REFERENCES roles(id) ON DELETE SET NULL");
  add("score", "INTEGER");
  add("score_details", "TEXT");
  add("screened_at", "TEXT");
  const emailCols = (db.prepare("PRAGMA table_info(emails)").all() as { name: string }[]).map((c) => c.name);
  if (!emailCols.includes("deleted")) db.exec("ALTER TABLE emails ADD COLUMN deleted INTEGER DEFAULT 0");
  // Clean up history left behind by applicants deleted in older versions (it skewed analytics).
  db.exec("DELETE FROM stage_history WHERE applicant_id NOT IN (SELECT id FROM applicants)");
  return db;
}
