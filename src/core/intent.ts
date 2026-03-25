import OpenAI from "openai";
import { z } from "zod";
import type { StructuredQuery } from "../adapters/types.js";
import { getApiKey, loadConfig } from "../config.js";

/**
 * Intent parser: natural language → structured query via LLM.
 *
 *   "三上悠亚的护士片"
 *       ↓ LLM
 *   { actress: "三上悠亚", tags: ["nurse"], sort: "relevance" }
 */

// JSON schema validation — if LLM returns garbage, we catch it
const QuerySchema = z.object({
  actress: z.string().optional(),
  tags: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  code: z.string().optional(),
  sort: z.enum(["relevance", "date", "views"]).optional(),
  query_raw: z.string().optional(),
});

const SYSTEM_PROMPT = `You are a search query parser for adult video content.
Convert the user's natural language input into a structured JSON query.

Output ONLY valid JSON with these optional fields:
- "actress": actress name (any language)
- "tags": array of content tags or body attribute tags (e.g. ["nurse", "cosplay", "巨乳", "tall", "F-cup"])
- "actions": array of action types (e.g. ["oral", "intercourse"])
- "code": video code/number if mentioned (e.g. "SSNI-889")
- "sort": "relevance" (default), "date" (newest), or "views" (most popular)
- "query_raw": the original text as fallback

Examples:
Input: "三上悠亚最新的护士系列"
Output: {"actress":"三上悠亚","tags":["nurse"],"sort":"date"}

Input: "SSNI-889"
Output: {"code":"SSNI-889"}

Input: "NTR with housewife"
Output: {"tags":["NTR","housewife"]}

Input: "巨乳的护士片"
Output: {"tags":["巨乳","nurse"]}

Input: "tall actress with big breasts"
Output: {"tags":["tall","big-breasts"]}

Output ONLY the JSON object, no markdown, no explanation.`;

export async function parseIntent(input: string): Promise<StructuredQuery> {
  const apiKey = getApiKey();
  if (!apiKey) {
    // No API key — fallback to raw query
    return { query_raw: input };
  }

  const config = loadConfig();

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    const response = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return { query_raw: input };
    }

    // Try to parse and validate JSON
    const parsed = JSON.parse(content);
    const validated = QuerySchema.safeParse(parsed);

    if (validated.success) {
      // Always keep query_raw as fallback
      return { ...validated.data, query_raw: input };
    }

    // Schema validation failed — fallback
    return { query_raw: input };
  } catch {
    // LLM API error — fallback to raw keyword search
    return { query_raw: input };
  }
}
