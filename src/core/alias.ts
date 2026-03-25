import { Database } from "bun:sqlite";
import type { SearchResult } from "../adapters/types.js";

/**
 * Alias engine: expand actress name → multiple search terms + deduplicate by code.
 *
 *   "三上悠亚"
 *       ↓ DB lookup
 *   ["Yua Mikami", "mikami yua", "三上悠亜"]  (max 3)
 */

const MAX_ALIASES = 3;

const CODE_PATTERN = /\b([A-Z]{2,5})-?(\d{3,5})\b/i;

export function expandAliases(db: Database, actressName: string): string[] {
  // Find the actress_id by matching any alias or primary name
  const actressRow = db
    .prepare(
      `SELECT aa.actress_id FROM actress_aliases aa
       WHERE aa.alias LIKE ? COLLATE NOCASE
       LIMIT 1`
    )
    .get(actressName) as { actress_id: number } | null;

  if (!actressRow) {
    // Try matching against actresses table directly
    const directMatch = db
      .prepare(
        `SELECT id FROM actresses
         WHERE name_ja LIKE ? COLLATE NOCASE
            OR name_en LIKE ? COLLATE NOCASE
            OR name_zh LIKE ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(actressName, actressName, actressName) as { id: number } | null;

    if (!directMatch) {
      return [actressName];
    }

    const allAliases = db
      .prepare(`SELECT alias FROM actress_aliases WHERE actress_id = ?`)
      .all(directMatch.id) as { alias: string }[];

    return [actressName, ...allAliases.map((r) => r.alias).filter((a) => a !== actressName)]
      .slice(0, MAX_ALIASES);
  }

  const allAliases = db
    .prepare(`SELECT alias FROM actress_aliases WHERE actress_id = ?`)
    .all(actressRow.actress_id) as { alias: string }[];

  const aliases = allAliases
    .map((r) => r.alias)
    .filter((a) => a !== actressName);

  return [actressName, ...aliases].slice(0, MAX_ALIASES);
}

export function extractCode(text: string): string | null {
  const match = text.match(CODE_PATTERN);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    const code = result.code ?? extractCode(result.title);

    if (code) {
      const existing = seen.get(code);
      if (
        !existing ||
        (result.duration_seconds ?? 0) > (existing.duration_seconds ?? 0)
      ) {
        seen.set(code, { ...result, code });
      }
    } else {
      seen.set(result.url, result);
    }
  }

  return Array.from(seen.values());
}
