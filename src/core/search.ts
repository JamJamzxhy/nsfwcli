import { Database } from "bun:sqlite";
import type { SearchResult, StructuredQuery } from "../adapters/types.js";
import { DbAdapter } from "../adapters/db.js";
import { SpankBangAdapter } from "../adapters/spankbang.js";
import { expandAliases, deduplicateResults } from "./alias.js";
import { parseIntent } from "./intent.js";

/**
 * Core search orchestrator — dual engine with concurrent execution.
 *
 *   User input (natural language)
 *       ↓
 *   LLM → StructuredQuery
 *       ↓
 *   Alias expansion (1 name → up to 3 search terms)
 *       ↓
 *   ┌───────────────┬──────────────────────┐
 *   │  DB search    │  SpankBang search     │  ← Promise.allSettled (concurrent)
 *   └───────┬───────┴──────────┬───────────┘
 *           └──────────────────┘
 *                    ↓
 *           Merge + deduplicate by code
 *                    ↓
 *           Results + writeback to DB
 */

export interface SearchOptions {
  limit?: number;
}

export async function search(
  input: string,
  db: Database.Database,
  options?: SearchOptions
): Promise<{ results: SearchResult[]; query: StructuredQuery }> {
  const limit = options?.limit ?? 10;

  // Step 1: Parse intent via LLM
  console.log("🧠 Parsing your request...");
  const query = await parseIntent(input);

  // Step 2: Expand aliases if actress specified
  let searchTerms: string[] = [];
  if (query.actress) {
    searchTerms = expandAliases(db, query.actress);
    if (searchTerms.length > 1) {
      console.log(`🔍 Searching with ${searchTerms.length} name variants...`);
    }
  }

  // Step 3: Concurrent dual-engine search
  const dbAdapter = new DbAdapter(db);
  const spankBangAdapter = new SpankBangAdapter();

  const dbSearchPromise = dbAdapter.search(query);

  // For SpankBang: search with each alias concurrently
  const spankBangPromises = searchTerms.length > 0
    ? searchTerms.map((term) =>
        spankBangAdapter.search({ ...query, actress: term })
      )
    : [spankBangAdapter.search(query)];

  // Run DB and all SpankBang searches concurrently
  const [dbResult, ...spankBangResults] = await Promise.allSettled([
    dbSearchPromise,
    ...spankBangPromises,
  ]);

  // Step 4: Collect results
  const allResults: SearchResult[] = [];

  if (dbResult.status === "fulfilled") {
    allResults.push(...dbResult.value);
  }

  for (const sbResult of spankBangResults) {
    if (sbResult.status === "fulfilled") {
      allResults.push(...sbResult.value);
    }
  }

  // Step 5: Deduplicate by code
  const deduplicated = deduplicateResults(allResults);

  // Step 6: Writeback external results to DB (non-blocking)
  const externalResults = deduplicated.filter((r) => r.source !== "local-db");
  if (externalResults.length > 0) {
    try {
      const sourceRow = db
        .prepare(`SELECT id FROM sources WHERE name = 'spankbang'`)
        .get() as { id: number } | undefined;
      if (sourceRow) {
        dbAdapter.writeBack(externalResults, sourceRow.id);
      }
    } catch {
      // Writeback failure is non-critical
    }
  }

  return {
    results: deduplicated.slice(0, limit),
    query,
  };
}
