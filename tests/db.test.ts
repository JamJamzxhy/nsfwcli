import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../src/db/schema.js";
import { loadSeedData } from "../src/db/seed-loader.js";
import { DbAdapter } from "../src/adapters/db.js";

describe("database adapter", () => {
  let db: Database;
  let adapter: DbAdapter;

  beforeEach(() => {
    db = initDb(":memory:");
    loadSeedData(db);
    adapter = new DbAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  it("searches by video code", async () => {
    const results = await adapter.search({ code: "SSNI-889" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].code).toContain("SSNI-889");
  });

  it("searches by actress name (Chinese)", async () => {
    const results = await adapter.search({ actress: "三上悠亚" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("searches by actress name (English)", async () => {
    const results = await adapter.search({ actress: "Yua Mikami" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty for unknown actress", async () => {
    const results = await adapter.search({ actress: "Unknown Person XYZ" });
    expect(results.length).toBe(0);
  });

  it("is always available", async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("writes back results without crashing", () => {
    const sourceRow = db.prepare("SELECT id FROM sources WHERE name = 'spankbang'").get() as { id: number };
    adapter.writeBack(
      [{ title: "Test Video", url: "https://example.com/test", source: "spankbang", code: "TEST-001" }],
      sourceRow.id
    );
    const video = db.prepare("SELECT * FROM videos WHERE code = 'TEST-001'").get();
    expect(video).toBeTruthy();
  });
});

describe("database schema", () => {
  let db: Database;

  beforeEach(() => {
    db = initDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates all tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("sources");
    expect(names).toContain("actresses");
    expect(names).toContain("actress_aliases");
    expect(names).toContain("videos");
    expect(names).toContain("video_actresses");
    expect(names).toContain("video_tags");
    expect(names).toContain("scenes");
  });

  it("seeds SpankBang as default source", () => {
    const source = db.prepare("SELECT * FROM sources WHERE name = 'spankbang'").get();
    expect(source).toBeTruthy();
  });

  it("supports multiple sources", () => {
    db.prepare("INSERT INTO sources (name, base_url, adapter_name) VALUES (?, ?, ?)").run(
      "xvideos",
      "https://www.xvideos.com",
      "xvideos"
    );
    const sources = db.prepare("SELECT * FROM sources").all();
    expect(sources.length).toBe(2);
  });
});
