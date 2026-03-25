import { Database } from "bun:sqlite";
import type { SearchAdapter, SearchResult, StructuredQuery } from "./types.js";

export class DbAdapter implements SearchAdapter {
  name = "local-db";
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async search(query: StructuredQuery): Promise<SearchResult[]> {
    if (query.code) return this.searchByCode(query.code);
    if (query.actress) return this.searchByActress(query.actress, query.tags);
    if (query.tags?.length) return this.searchByTags(query.tags);
    if (query.query_raw) return this.searchByText(query.query_raw);
    return [];
  }

  private searchByCode(code: string): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT v.*, s.name as source_name
         FROM videos v
         LEFT JOIN sources s ON v.source_id = s.id
         WHERE v.code LIKE ? COLLATE NOCASE
         LIMIT 20`
      )
      .all(`%${code}%`) as VideoRow[];

    return rows.map((r) => this.toSearchResult(r));
  }

  private searchByActress(actress: string, tags?: string[]): SearchResult[] {
    let sql = `
      SELECT DISTINCT v.*, s.name as source_name
      FROM videos v
      JOIN video_actresses va ON v.id = va.video_id
      JOIN actresses a ON va.actress_id = a.id
      LEFT JOIN actress_aliases aa ON a.id = aa.actress_id
      LEFT JOIN sources s ON v.source_id = s.id
      WHERE (aa.alias LIKE ? COLLATE NOCASE
         OR a.name_ja LIKE ? COLLATE NOCASE
         OR a.name_en LIKE ? COLLATE NOCASE
         OR a.name_zh LIKE ? COLLATE NOCASE)
    `;
    const params: string[] = [actress, actress, actress, actress];

    if (tags?.length) {
      const tagPlaceholders = tags.map(() => "?").join(",");
      sql += ` AND (
        v.id IN (SELECT video_id FROM video_tags WHERE tag IN (${tagPlaceholders}) COLLATE NOCASE)
        OR v.id IN (
          SELECT va2.video_id FROM video_actresses va2
          JOIN actress_tags at ON va2.actress_id = at.actress_id
          WHERE at.tag IN (${tagPlaceholders}) COLLATE NOCASE
        )
      )`;
      params.push(...tags, ...tags);
    }

    sql += ` LIMIT 50`;

    const rows = this.db.prepare(sql).all(...params) as VideoRow[];
    return rows.map((r) => this.toSearchResult(r));
  }

  private searchByTags(tags: string[]): SearchResult[] {
    const placeholders = tags.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT DISTINCT v.*, s.name as source_name
         FROM videos v
         LEFT JOIN sources s ON v.source_id = s.id
         WHERE v.id IN (
           SELECT video_id FROM video_tags WHERE tag IN (${placeholders}) COLLATE NOCASE
         )
         OR v.id IN (
           SELECT va.video_id FROM video_actresses va
           JOIN actress_tags at ON va.actress_id = at.actress_id
           WHERE at.tag IN (${placeholders}) COLLATE NOCASE
         )
         LIMIT 50`
      )
      .all(...tags, ...tags) as VideoRow[];

    return rows.map((r) => this.toSearchResult(r));
  }

  private searchByText(text: string): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT v.*, s.name as source_name
         FROM videos v
         LEFT JOIN sources s ON v.source_id = s.id
         WHERE v.title LIKE ? COLLATE NOCASE
            OR v.raw_title LIKE ? COLLATE NOCASE
            OR v.code LIKE ? COLLATE NOCASE
         LIMIT 50`
      )
      .all(`%${text}%`, `%${text}%`, `%${text}%`) as VideoRow[];

    return rows.map((r) => this.toSearchResult(r));
  }

  private toSearchResult(row: VideoRow): SearchResult {
    return {
      title: row.title ?? row.raw_title ?? "Unknown",
      url: row.source_url ?? "",
      duration_seconds: row.duration_seconds ?? undefined,
      code: row.code ?? undefined,
      source: row.source_name ?? "local-db",
      studio: row.studio ?? undefined,
      release_date: row.release_date ?? undefined,
    };
  }

  writeBack(results: SearchResult[], sourceId: number): void {
    const insertVideo = this.db.prepare(`
      INSERT OR IGNORE INTO videos (code, title, source_url, source_id, raw_title, confidence, identified_by, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, 'metadata', datetime('now'))
    `);

    const writeAll = this.db.transaction(() => {
      for (const result of results) {
        try {
          insertVideo.run(
            result.code ?? null,
            result.title,
            result.url,
            sourceId,
            result.title,
            result.code ? 0.9 : 0.5
          );
        } catch {
          // Silently skip
        }
      }
    });

    try {
      writeAll();
    } catch {
      // Non-critical
    }
  }
}

interface VideoRow {
  id: number;
  code: string | null;
  title: string | null;
  duration_seconds: number | null;
  source_url: string | null;
  raw_title: string | null;
  source_name: string | null;
  studio: string | null;
  release_date: string | null;
}
