import { execSync, spawn } from "child_process";

/**
 * Player: detect local player and open video.
 *
 *   Priority: mpv > iina > vlc > browser
 */

type PlayerName = "mpv" | "iina" | "vlc" | "browser";

interface DetectedPlayer {
  name: PlayerName;
  path: string;
}

export interface PlayOptions {
  startSeconds?: number;
  referrer?: string;
}

export function detectPlayer(): DetectedPlayer {
  const candidates: { name: PlayerName; commands: string[] }[] = [
    { name: "mpv", commands: ["mpv"] },
    { name: "iina", commands: ["iina", "/Applications/IINA.app/Contents/MacOS/iina-cli"] },
    { name: "vlc", commands: ["vlc", "/Applications/VLC.app/Contents/MacOS/VLC"] },
  ];

  for (const candidate of candidates) {
    for (const cmd of candidate.commands) {
      try {
        execSync(`which ${cmd} 2>/dev/null`, { stdio: "pipe" });
        return { name: candidate.name, path: cmd };
      } catch {
        continue;
      }
    }
  }

  return { name: "browser", path: "open" };
}

export function playVideo(url: string, options?: PlayOptions): void {
  const player = detectPlayer();

  switch (player.name) {
    case "mpv": {
      const args = [url, "--no-terminal"];
      if (options?.referrer) {
        args.push(`--referrer=${options.referrer}`);
      }
      if (options?.startSeconds) {
        args.push(`--start=${formatTime(options.startSeconds)}`);
      }
      spawn(player.path, args, { detached: true, stdio: "ignore" }).unref();
      break;
    }
    case "iina": {
      const args = ["--no-stdin", url];
      if (options?.referrer) {
        args.push(`--mpv-referrer=${options.referrer}`);
      }
      if (options?.startSeconds) {
        args.push(`--mpv-start=${formatTime(options.startSeconds)}`);
      }
      spawn(player.path, args, { detached: true, stdio: "ignore" }).unref();
      break;
    }
    case "vlc": {
      const args = [url];
      if (options?.referrer) {
        args.push(`--http-referrer=${options.referrer}`);
      }
      if (options?.startSeconds) {
        args.push(`--start-time=${options.startSeconds}`);
      }
      spawn(player.path, args, { detached: true, stdio: "ignore" }).unref();
      break;
    }
    case "browser":
    default: {
      const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
      spawn(openCmd, [url], { detached: true, stdio: "ignore" }).unref();
      break;
    }
  }

  console.log(`▶ Playing with ${player.name}...`);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
