import { execSync } from "child_process";
import type { SearchAdapter, SearchResult, StructuredQuery } from "./types.js";
import { extractCode } from "../core/alias.js";

/**
 * SpankBang search adapter.
 *
 *   Execution layer priority:
 *   1. bb-browser  (real Chrome via extension bridge — best Cloudflare bypass)
 *   2. OpenCLI     (daemon API)
 *   3. Playwright   (headless browser)
 *   4. Fetch        (plain HTTP, often blocked)
 */

type ExecutionLayer = "bb-browser" | "opencli" | "playwright" | "fetch";

export class SpankBangAdapter implements SearchAdapter {
  name = "spankbang";
  private executionLayer: ExecutionLayer | null = null;

  async isAvailable(): Promise<boolean> {
    this.executionLayer = await this.detectExecutionLayer();
    return this.executionLayer !== null;
  }

  async search(query: StructuredQuery): Promise<SearchResult[]> {
    if (!this.executionLayer) {
      this.executionLayer = await this.detectExecutionLayer();
    }

    const searchTerms = this.buildSearchTerms(query);
    if (!searchTerms) return [];

    const searchUrl = `https://spankbang.com/s/${encodeURIComponent(searchTerms)}/`;

    try {
      const html = await this.fetchPage(searchUrl);
      if (!html) return [];
      return this.parseSearchResults(html);
    } catch {
      return [];
    }
  }

  async extractVideoUrl(pageUrl: string): Promise<string | null> {
    if (!this.executionLayer) {
      this.executionLayer = await this.detectExecutionLayer();
    }

    // bb-browser fast path: open page in real Chrome and eval directly
    if (this.executionLayer === "bb-browser") {
      try {
        return await this.extractViaBbBrowser(pageUrl);
      } catch {
        // fall through to generic HTML approach
      }
    }

    try {
      const html = await this.fetchPage(pageUrl);
      if (!html) return null;
      return this.parseVideoUrl(html);
    } catch {
      return null;
    }
  }

  // --- bb-browser video extraction (proven approach) ---

  private async extractViaBbBrowser(pageUrl: string): Promise<string | null> {
    execSync(`bb-browser open "${pageUrl}"`, {
      timeout: 15000,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Wait for page load
    await new Promise((r) => setTimeout(r, 4000));

    // Use single-quoted shell string to avoid escaping hell
    const jsCode = `var m=document.documentElement.innerHTML.match(/source src="([^"]+)"\\s+type="video\\/mp4"/); m?m[1]:'not found';`;

    try {
      const result = execSync(`bb-browser eval '${jsCode}'`, {
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (result && result !== "not found" && result.includes("http")) {
        return result.replace(/&amp;/g, "&");
      }
    } catch {
      // fall through
    }

    // Fallback: try stream_data pattern
    const jsCode2 = `var h=document.documentElement.innerHTML;var m=h.match(/stream_data\\['720p'\\]\\s*=\\s*'([^']+)'/);m?m[1]:'not found';`;
    try {
      const result = execSync(`bb-browser eval '${jsCode2}'`, {
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (result && result !== "not found" && result.includes("http")) {
        return result.replace(/&amp;/g, "&");
      }
    } catch {
      // fall through
    }

    return null;
  }

  // --- page fetching ---

  private async fetchPage(url: string): Promise<string | null> {
    switch (this.executionLayer) {
      case "bb-browser":
        return this.fetchViaBbBrowser(url);
      case "opencli":
        return this.fetchViaOpenCli(url);
      case "playwright":
        return this.fetchViaPlaywright(url);
      case "fetch":
        return this.fetchViaHttp(url);
      default:
        return null;
    }
  }

  private async fetchViaBbBrowser(url: string): Promise<string | null> {
    try {
      execSync(`bb-browser open "${url}"`, {
        timeout: 15000,
        stdio: "pipe",
        encoding: "utf-8",
      });

      await new Promise((r) => setTimeout(r, 3000));

      const html = execSync(
        `bb-browser eval "document.documentElement.outerHTML"`,
        { timeout: 10000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      if (html && html.length > 500) {
        return html;
      }

      throw new Error("empty page");
    } catch (e: any) {
      console.warn(`⚠ bb-browser failed: ${e.message}, trying fallback...`);
      this.executionLayer = "fetch";
      return this.fetchViaHttp(url);
    }
  }

  private async fetchViaOpenCli(url: string): Promise<string | null> {
    const daemonPort = process.env.OPENCLI_DAEMON_PORT || 19825;
    const base = `http://localhost:${daemonPort}/command`;
    try {
      const navResp = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `nav_${Date.now()}`,
          action: "navigate",
          url,
          workspace: "nsfwcli",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!navResp.ok) throw new Error(`navigate failed: ${navResp.status}`);

      await new Promise((r) => setTimeout(r, 3000));

      const htmlResp = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `html_${Date.now()}`,
          action: "exec",
          code: "document.documentElement.outerHTML",
          workspace: "nsfwcli",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!htmlResp.ok) throw new Error(`exec failed: ${htmlResp.status}`);

      const result = (await htmlResp.json()) as {
        ok: boolean;
        data?: string;
        error?: string;
      };
      if (!result.ok || !result.data) throw new Error(result.error || "no data");

      return result.data;
    } catch (e: any) {
      console.warn(`⚠ OpenCLI daemon failed: ${e.message}, trying fallback...`);
      this.executionLayer = "fetch";
      return this.fetchViaHttp(url);
    }
  }

  private async fetchViaPlaywright(url: string): Promise<string | null> {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      const html = await page.content();
      await browser.close();
      return html;
    } catch {
      return null;
    }
  }

  private async fetchViaHttp(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  // --- HTML parsing ---

  private parseVideoUrl(html: string): string | null {
    const streamMatch = html.match(
      /stream_data\['(\d+p)'\]\s*=\s*'([^']+)'/
    );
    if (streamMatch) return streamMatch[2];

    const sourceMatch = html.match(
      /<source\s+src="([^"]+)"\s+type="video\/mp4"/
    );
    if (sourceMatch) return sourceMatch[1];

    return null;
  }

  private parseSearchResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];

    const itemPattern =
      /<div[^>]*class="[^"]*video-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>/;
    const titlePattern = /<a[^>]*class="[^"]*n[^"]*"[^>]*>([^<]*)<\/a>/;
    const durationPattern =
      /<span[^>]*class="[^"]*l[^"]*"[^>]*>([^<]*)<\/span>/;

    let match;
    while ((match = itemPattern.exec(html)) !== null) {
      const block = match[1];

      const linkMatch = block.match(linkPattern);
      const titleMatch = block.match(titlePattern);
      const durationMatch = block.match(durationPattern);

      if (linkMatch && titleMatch) {
        const title = titleMatch[1].trim();
        const href = linkMatch[1].startsWith("http")
          ? linkMatch[1]
          : `https://spankbang.com${linkMatch[1]}`;

        results.push({
          title,
          url: href,
          duration: durationMatch?.[1]?.trim(),
          code: extractCode(title) ?? undefined,
          source: "spankbang",
        });
      }
    }

    if (results.length === 0) {
      const simpleLinkPattern =
        /<a[^>]*href="(\/[a-z0-9]+\/video\/[^"]*)"[^>]*title="([^"]*)"/g;
      while ((match = simpleLinkPattern.exec(html)) !== null) {
        results.push({
          title: match[2],
          url: `https://spankbang.com${match[1]}`,
          code: extractCode(match[2]) ?? undefined,
          source: "spankbang",
        });
      }
    }

    return results.slice(0, 20);
  }

  private buildSearchTerms(query: StructuredQuery): string | null {
    const parts: string[] = [];

    if (query.actress) parts.push(query.actress);
    if (query.code) parts.push(query.code);
    if (query.tags?.length) parts.push(...query.tags);
    if (query.actions?.length) parts.push(...query.actions);

    if (parts.length === 0 && query.query_raw) {
      return query.query_raw;
    }

    return parts.length > 0 ? parts.join(" ") : null;
  }

  // --- execution layer detection ---

  private async detectExecutionLayer(): Promise<ExecutionLayer> {
    // 1. bb-browser (real Chrome, best Cloudflare bypass)
    try {
      execSync("which bb-browser", { stdio: "pipe" });
      return "bb-browser";
    } catch {
      // not installed
    }

    // 2. OpenCLI daemon
    try {
      execSync("which opencli", { stdio: "pipe" });
      return "opencli";
    } catch {
      // not installed
    }

    // 3. Playwright
    try {
      await import("playwright");
      return "playwright";
    } catch {
      // not installed
    }

    // 4. Fallback to fetch
    return "fetch";
  }
}
