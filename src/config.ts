import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".nsfwcli");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface NsfwCliConfig {
  llm: {
    provider: "openai" | "claude";
    model: string;
    baseURL?: string;
  };
  proxy?: string;
  default_limit: number;
  preferred_source: string;
}

const DEFAULT_CONFIG: NsfwCliConfig = {
  llm: {
    provider: "openai",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  },
  default_limit: 10,
  preferred_source: "spankbang",
};

export function getApiKey(): string | null {
  // Environment variable takes priority (security best practice)
  const envKey =
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    null;
  return envKey;
}

export function loadConfig(): NsfwCliConfig {
  if (!existsSync(CONFIG_PATH)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<NsfwCliConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export function isConfigured(): boolean {
  return getApiKey() !== null;
}
