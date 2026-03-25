import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

const DB_DIR = join(homedir(), ".nsfwcli");
const DB_PATH = join(DB_DIR, "nsfwcli.db");

export function getDbPath(): string {
  return DB_PATH;
}

export function initDb(dbPath?: string): Database {
  const path = dbPath ?? DB_PATH;
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec("PRAGMA foreign_keys = ON");

  createTables(db);
  seedDefaultSources(db);

  return db;
}

function createTables(db: Database): void {
  // Create tables one at a time (bun:sqlite requires separate exec calls for DDL referencing other tables)
  const statements = [
    `CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, base_url TEXT NOT NULL,
      adapter_name TEXT NOT NULL, enabled INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS actresses (
      id INTEGER PRIMARY KEY, name_ja TEXT, name_en TEXT, name_zh TEXT, debut_year INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS actress_aliases (
      id INTEGER PRIMARY KEY,
      actress_id INTEGER NOT NULL REFERENCES actresses(id) ON DELETE CASCADE,
      alias TEXT NOT NULL, UNIQUE(actress_id, alias)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_alias ON actress_aliases(alias COLLATE NOCASE)`,
    `CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY, code TEXT, title TEXT, duration_seconds INTEGER,
      release_date TEXT, studio TEXT, series TEXT,
      source_id INTEGER REFERENCES sources(id), source_url TEXT, raw_title TEXT,
      confidence REAL, identified_by TEXT, scanned_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), UNIQUE(code, source_id)
    )`,
    `CREATE TABLE IF NOT EXISTS video_actresses (
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      actress_id INTEGER NOT NULL REFERENCES actresses(id) ON DELETE CASCADE,
      PRIMARY KEY (video_id, actress_id)
    )`,
    `CREATE TABLE IF NOT EXISTS video_tags (
      id INTEGER PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      tag TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_video_tag ON video_tags(tag COLLATE NOCASE)`,
    `CREATE TABLE IF NOT EXISTS actress_tags (
      id INTEGER PRIMARY KEY,
      actress_id INTEGER NOT NULL REFERENCES actresses(id) ON DELETE CASCADE,
      tag TEXT NOT NULL, UNIQUE(actress_id, tag)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_actress_tag ON actress_tags(tag COLLATE NOCASE)`,
    `CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      start_seconds INTEGER NOT NULL, end_seconds INTEGER,
      scene_type TEXT, setting TEXT, position TEXT, costume TEXT,
      tags TEXT, contributed_by TEXT, verified_count INTEGER DEFAULT 0
    )`,
  ];

  for (const sql of statements) {
    db.exec(sql);
  }
}

function seedDefaultSources(db: Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO sources (name, base_url, adapter_name)
    VALUES (?, ?, ?)
  `).run("spankbang", "https://spankbang.com", "spankbang");
}
