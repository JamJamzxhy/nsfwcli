import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../src/db/schema.js";
import { loadSeedData } from "../src/db/seed-loader.js";
import { expandAliases, extractCode, deduplicateResults } from "../src/core/alias.js";
import type { SearchResult } from "../src/adapters/types.js";

describe("alias engine", () => {
  let db: Database;

  beforeEach(() => {
    db = initDb(":memory:");
    loadSeedData(db);
  });

  afterEach(() => {
    db.close();
  });

  it("expands known actress name to aliases", () => {
    const aliases = expandAliases(db, "三上悠亚");
    expect(aliases.length).toBeGreaterThan(1);
    expect(aliases.length).toBeLessThanOrEqual(3);
    expect(aliases[0]).toBe("三上悠亚");
  });

  it("returns original name for unknown actress", () => {
    const aliases = expandAliases(db, "Unknown Person");
    expect(aliases).toEqual(["Unknown Person"]);
  });

  it("works with English name", () => {
    const aliases = expandAliases(db, "Yua Mikami");
    expect(aliases.length).toBeGreaterThan(1);
  });
});

describe("extractCode", () => {
  it("extracts standard code", () => {
    expect(extractCode("SSNI-889 三上悠亚")).toBe("SSNI-889");
  });

  it("extracts code without hyphen", () => {
    expect(extractCode("SSNI889")).toBe("SSNI-889");
  });

  it("returns null for no code", () => {
    expect(extractCode("sexy teacher video")).toBeNull();
  });

  it("handles lowercase", () => {
    expect(extractCode("ssni-889")).toBe("SSNI-889");
  });
});

describe("deduplicateResults", () => {
  it("deduplicates by code", () => {
    const results: SearchResult[] = [
      { title: "SSNI-889 Yua Mikami", url: "https://a.com/1", source: "spankbang", code: "SSNI-889", duration_seconds: 7200 },
      { title: "Yua Mikami SSNI-889 HD", url: "https://a.com/2", source: "spankbang", code: "SSNI-889", duration_seconds: 3600 },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.length).toBe(1);
    expect(deduped[0].duration_seconds).toBe(7200);
  });

  it("keeps results without codes as separate", () => {
    const results: SearchResult[] = [
      { title: "sexy teacher", url: "https://a.com/1", source: "spankbang" },
      { title: "hot nurse", url: "https://a.com/2", source: "spankbang" },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.length).toBe(2);
  });

  it("extracts code from title for dedup", () => {
    const results: SearchResult[] = [
      { title: "SSNI-889 nurse", url: "https://a.com/1", source: "spankbang" },
      { title: "SSNI-889 HD", url: "https://a.com/2", source: "db" },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.length).toBe(1);
  });
});
