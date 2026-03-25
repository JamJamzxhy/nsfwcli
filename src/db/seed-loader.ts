import { Database } from "bun:sqlite";
import seedData from "./seed.json";

export interface SeedStats {
  actresses: number;
  aliases: number;
  videos: number;
  actressTags: number;
  videoTags: number;
}

export function loadSeedData(db: Database): SeedStats {
  const insertActress = db.prepare(`
    INSERT OR IGNORE INTO actresses (name_ja, name_en, name_zh, debut_year)
    VALUES (?, ?, ?, ?)
  `);

  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO actress_aliases (actress_id, alias)
    VALUES (?, ?)
  `);

  const insertActressTag = db.prepare(`
    INSERT OR IGNORE INTO actress_tags (actress_id, tag)
    VALUES (?, ?)
  `);

  const insertVideo = db.prepare(`
    INSERT OR IGNORE INTO videos (code, title, studio, series, release_date, duration_seconds, source_id)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `);

  const findVideo = db.prepare(`
    SELECT id FROM videos WHERE code = ?
  `);

  const insertVideoActress = db.prepare(`
    INSERT OR IGNORE INTO video_actresses (video_id, actress_id)
    VALUES (?, ?)
  `);

  const insertVideoTag = db.prepare(`
    INSERT OR IGNORE INTO video_tags (video_id, tag)
    VALUES (?, ?)
  `);

  const checkActress = db.prepare(`
    SELECT id FROM actresses WHERE name_ja = ? OR name_en = ?
  `);

  const stats: SeedStats = { actresses: 0, aliases: 0, videos: 0, actressTags: 0, videoTags: 0 };

  const loadAll = db.transaction(() => {
    for (const actress of seedData.actresses) {
      // Check if already exists
      const existing = checkActress.get(actress.name_ja, actress.name_en) as { id: number } | null;
      if (existing) continue;

      insertActress.run(
        actress.name_ja,
        actress.name_en,
        actress.name_zh,
        actress.debut_year
      );

      const row = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
      const actressId = row.id;
      stats.actresses++;

      // Insert all aliases including the primary names
      const allAliases = [
        ...actress.aliases,
        actress.name_ja,
        actress.name_en,
        actress.name_zh,
      ].filter(Boolean);

      for (const alias of new Set(allAliases)) {
        try {
          insertAlias.run(actressId, alias);
          stats.aliases++;
        } catch {
          // Duplicate alias, skip
        }
      }

      // Insert actress-level tags
      for (const tag of actress.tags ?? []) {
        try {
          insertActressTag.run(actressId, tag);
          stats.actressTags++;
        } catch {
          // Duplicate tag, skip
        }
      }

      // Insert videos with full metadata
      for (const video of actress.videos ?? []) {
        try {
          insertVideo.run(
            video.code,
            video.title,
            video.studio ?? null,
            video.series ?? null,
            video.release_date ?? null,
            video.duration_seconds ?? null
          );
          stats.videos++;
        } catch {
          // Duplicate video (shared across actresses), skip insert
        }

        // Link video to actress (works even if video already existed)
        const videoRow = findVideo.get(video.code) as { id: number } | null;
        if (videoRow) {
          try {
            insertVideoActress.run(videoRow.id, actressId);
          } catch {
            // Already linked
          }

          // Insert video tags
          for (const tag of video.tags ?? []) {
            try {
              insertVideoTag.run(videoRow.id, tag);
              stats.videoTags++;
            } catch {
              // Duplicate tag, skip
            }
          }
        }
      }
    }
  });

  loadAll();
  return stats;
}
