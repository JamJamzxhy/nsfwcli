import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Downloader: download videos to local disk via curl.
 *
 *   Direct URL + referrer → curl → local .mp4 file
 */

export interface DownloadOptions {
  outputDir?: string;
  filename?: string;
  referrer?: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

export async function downloadVideo(
  url: string,
  options?: DownloadOptions
): Promise<DownloadResult> {
  const outputDir = options?.outputDir || ".";
  const filename = options?.filename
    ? `${sanitizeFilename(options.filename)}.mp4`
    : filenameFromUrl(url);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filePath = join(outputDir, filename);

  console.log(`📥 Downloading to: ${filePath}`);

  const args = [
    "-L",           // follow redirects
    "-#",           // progress bar
    "-o", filePath, // output file
  ];

  if (options?.referrer) {
    args.push("-H", `Referer: ${options.referrer}`);
  }

  args.push(url);

  return new Promise<DownloadResult>((resolve) => {
    const proc = spawn("curl", args, {
      stdio: ["pipe", "pipe", "inherit"], // stderr shows progress
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ Download complete: ${filePath}`);
        resolve({ success: true, filePath });
      } else {
        console.error(`\n❌ Download failed (exit code ${code})`);
        resolve({ success: false, error: `curl exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      console.error(`\n❌ Download error: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() || "video";
    return base.endsWith(".mp4") ? base : `${base}.mp4`;
  } catch {
    return `video_${Date.now()}.mp4`;
  }
}
