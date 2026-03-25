#!/usr/bin/env node
import { Command } from "commander";
import { initDb } from "./db/schema.js";
import { loadSeedData } from "./db/seed-loader.js";
import { search } from "./core/search.js";
import { playVideo } from "./core/player.js";
import { downloadVideo, sanitizeFilename } from "./core/downloader.js";
import { SpankBangAdapter } from "./adapters/spankbang.js";
import { isConfigured, loadConfig, saveConfig, getApiKey } from "./config.js";
import { createInterface } from "readline";
import type { SearchResult } from "./adapters/types.js";

const REFERRER = "https://spankbang.com/";

const program = new Command();

program
  .name("nsfwcli")
  .description("AI-powered NSFW content search CLI")
  .version("0.1.0");

// --- search command ---
program
  .command("search")
  .argument("<query...>", "Natural language search query")
  .option("-l, --limit <n>", "Number of results", "10")
  .option("--no-play", "Don't auto-play, just show results")
  .option("-d, --download [dir]", "Download instead of play (optionally specify output dir)")
  .action(async (queryParts: string[], opts) => {
    const query = queryParts.join(" ");
    const limit = parseInt(opts.limit, 10);

    if (!isConfigured()) {
      console.log("⚠ No API key found. Set OPENAI_API_KEY environment variable or run: nsfwcli setup");
      console.log("  Falling back to keyword search (no AI intent parsing).\n");
    }

    const db = initDb();

    try {
      const { results, query: parsedQuery } = await search(query, db, { limit });

      if (results.length === 0) {
        console.log("\n😞 No results found. Try:");
        console.log("  - A different description");
        console.log("  - An actress name in English or Japanese");
        console.log("  - A video code like SSNI-889");
        return;
      }

      displayResults(results);

      if (opts.play !== false || opts.download) {
        const action = opts.download ? "download" : "play";
        console.log(`\n  Enter number to ${action} (or 'q' to quit):`);
        const choice = await promptUser("> ");

        if (choice && choice !== "q") {
          const idx = parseInt(choice, 10) - 1;
          if (idx >= 0 && idx < results.length) {
            const selected = results[idx];

            if (opts.download) {
              await extractAndDownload(selected, typeof opts.download === "string" ? opts.download : ".");
            } else {
              await extractAndPlay(selected);
            }
          } else {
            console.log("Invalid selection.");
          }
        }
      }
    } finally {
      db.close();
    }
  });

// --- download command ---
program
  .command("download")
  .description("Download a video by URL or search query")
  .argument("<input...>", "SpankBang URL or search query")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(async (inputParts: string[], opts) => {
    const input = inputParts.join(" ");
    const isUrl = input.startsWith("http://") || input.startsWith("https://");

    if (isUrl) {
      // Direct URL download
      console.log("🔗 Extracting video link...");
      const adapter = new SpankBangAdapter();
      const directUrl = await adapter.extractVideoUrl(input);

      if (directUrl) {
        await downloadVideo(directUrl, {
          outputDir: opts.output,
          referrer: REFERRER,
        });
      } else {
        console.error("❌ Could not extract video URL.");
        process.exit(1);
      }
    } else {
      // Search first, then download
      if (!isConfigured()) {
        console.log("⚠ No API key. Falling back to keyword search.\n");
      }

      const db = initDb();
      try {
        const { results } = await search(input, db, { limit: 10 });

        if (results.length === 0) {
          console.log("😞 No results found.");
          return;
        }

        displayResults(results);
        console.log("\n  Enter number to download (or 'q' to quit):");
        const choice = await promptUser("> ");

        if (choice && choice !== "q") {
          const idx = parseInt(choice, 10) - 1;
          if (idx >= 0 && idx < results.length) {
            await extractAndDownload(results[idx], opts.output);
          } else {
            console.log("Invalid selection.");
          }
        }
      } finally {
        db.close();
      }
    }
  });

// --- setup command ---
program
  .command("setup")
  .description("Configure nsfwcli (API key, preferences)")
  .action(async () => {
    console.log("🔧 nsfwcli setup\n");

    const existingKey = getApiKey();
    if (existingKey) {
      console.log("✅ API key found in environment variable.");
    } else {
      console.log("No API key found.");
      console.log("Set one of these environment variables:");
      console.log("  export OPENAI_API_KEY=sk-...");
      console.log("  export ANTHROPIC_API_KEY=sk-ant-...\n");
    }

    console.log("📦 Initializing database...");
    const db = initDb();
    const stats = loadSeedData(db);
    if (stats.actresses > 0) {
      console.log(`  Loaded ${stats.actresses} actresses, ${stats.aliases} aliases, ${stats.videos} videos, ${stats.actressTags} actress tags, ${stats.videoTags} video tags.`);
    } else {
      console.log("  Database already seeded.");
    }
    db.close();

    console.log("\n✅ Setup complete! Try: nsfwcli search \"三上悠亚 nurse\"");
  });

// --- config command ---
program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    const apiKey = getApiKey();

    console.log("📋 Current configuration:\n");
    console.log(`  LLM Provider: ${config.llm.provider}`);
    console.log(`  LLM Model:    ${config.llm.model}`);
    console.log(`  API Key:      ${apiKey ? "✅ set (env var)" : "❌ not set"}`);
    console.log(`  Proxy:        ${config.proxy ?? "none"}`);
    console.log(`  Result Limit: ${config.default_limit}`);
    console.log(`  Source:       ${config.preferred_source}`);
  });

// --- seed command ---
program
  .command("seed")
  .description("Load seed data into the database")
  .action(() => {
    const db = initDb();
    const stats = loadSeedData(db);
    console.log(`Loaded ${stats.actresses} actresses, ${stats.aliases} aliases, ${stats.videos} videos, ${stats.actressTags} actress tags, ${stats.videoTags} video tags.`);
    db.close();
  });

program.parse();

// --- helpers ---

function displayResults(results: SearchResult[]): void {
  console.log(`\n📺 Found ${results.length} results:\n`);
  results.forEach((r, i) => {
    const code = r.code ? `[${r.code}] ` : "";
    const duration = r.duration ? ` | ${r.duration}` : "";
    const source = r.source !== "local-db" ? ` (${r.source})` : " (local)";
    console.log(`  ${(i + 1).toString().padStart(2)}. ${code}${r.title}${duration}${source}`);
  });
}

async function extractAndPlay(selected: SearchResult): Promise<void> {
  console.log("🔗 Extracting video link...");
  const adapter = new SpankBangAdapter();
  const directUrl = await adapter.extractVideoUrl(selected.url);

  if (directUrl) {
    console.log("✅ Direct link found — playing ad-free!");
    playVideo(directUrl, { referrer: REFERRER });
  } else {
    console.log("⚠ No direct link — opening in browser.");
    playVideo(selected.url);
  }
}

async function extractAndDownload(
  selected: SearchResult,
  outputDir: string
): Promise<void> {
  console.log("🔗 Extracting video link...");
  const adapter = new SpankBangAdapter();
  const directUrl = await adapter.extractVideoUrl(selected.url);

  if (directUrl) {
    console.log("✅ Direct link found — starting download...");
    const filename = selected.code
      ? `${selected.code} ${sanitizeFilename(selected.title)}`
      : sanitizeFilename(selected.title);
    await downloadVideo(directUrl, {
      outputDir,
      filename,
      referrer: REFERRER,
    });
  } else {
    console.error("❌ Could not extract direct video link for download.");
  }
}

function promptUser(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
