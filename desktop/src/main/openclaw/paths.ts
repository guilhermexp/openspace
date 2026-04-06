import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { getPlatform } from "../platform";

export type ResolvedGlobalOpenClaw = {
  bin: string;
  dir: string;
};

function normalizeCandidate(value: string): string {
  return value.trim().replace(/^"(.*)"$/, "$1");
}

function resolveCommandPath(command: string): string | null {
  const locator = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(locator, [command], { encoding: "utf-8" });
  if (res.status !== 0) {
    return null;
  }
  const lines = String(res.stdout || "")
    .split(/\r?\n/)
    .map((line) => normalizeCandidate(line))
    .filter(Boolean);
  return lines[0] || null;
}

function resolveExistingBin(candidate: string): string | null {
  const normalized = normalizeCandidate(candidate);
  if (!normalized) {
    return null;
  }
  const looksLikePath =
    path.isAbsolute(normalized) || normalized.includes("/") || normalized.includes("\\");
  if (looksLikePath) {
    return fs.existsSync(normalized) ? normalized : null;
  }
  return resolveCommandPath(normalized);
}

function globalBinCandidates(): string[] {
  const ext = getPlatform().binaryExtension();
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const candidates = [
    process.env.OPENCLAW_BIN || "",
    "openclaw",
    path.join("/usr/local/bin", `openclaw${ext}`),
    path.join("/opt/homebrew/bin", `openclaw${ext}`),
    path.join(home, ".npm-global", "bin", `openclaw${ext}`),
    path.join(home, ".local", "bin", `openclaw${ext}`),
    path.join(appData, "npm", `openclaw${ext}`),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", `openclaw${ext}`),
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
}

function resolveInstalledOpenClawDir(bin: string): string {
  const binDir = path.dirname(bin);
  const candidates = [
    path.resolve(binDir, "..", "lib", "node_modules", "openclaw"),
    path.resolve(binDir, "node_modules", "openclaw"),
    path.resolve(binDir, "..", "node_modules", "openclaw"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return binDir;
}

export function resolveGlobalOpenClaw(): ResolvedGlobalOpenClaw | null {
  for (const candidate of globalBinCandidates()) {
    const bin = resolveExistingBin(candidate);
    if (!bin) {
      continue;
    }
    return {
      bin,
      dir: resolveInstalledOpenClawDir(bin),
    };
  }
  return null;
}

/**
 * Resolve the path to a bundled tool binary shipped inside the Electron
 * resources directory. Layout: `resources/<tool>/<platform>-<arch>/<tool>[.exe]`.
 */
export function bundledBin(tool: string): string {
  const binName = `${tool}${getPlatform().binaryExtension()}`;
  return path.join(process.resourcesPath, tool, `${process.platform}-${process.arch}`, binName);
}

/**
 * Resolve the path to a downloaded tool binary stored next to the Electron
 * app sources (dev mode). Layout: `<appDir>/.<tool>-runtime/<platform>-<arch>/<tool>[.exe]`.
 */
export function downloadedBin(mainDir: string, tool: string): string {
  const appDir = path.resolve(mainDir, "..");
  const binName = `${tool}${getPlatform().binaryExtension()}`;
  return path.join(appDir, `.${tool}-runtime`, `${process.platform}-${process.arch}`, binName);
}

/**
 * Resolve a tool binary path: bundled (packaged) or downloaded (dev).
 * Combines bundledBin / downloadedBin into a single call.
 */
export function resolveBin(tool: string, opts: { isPackaged: boolean; mainDir: string }): string {
  return opts.isPackaged ? bundledBin(tool) : downloadedBin(opts.mainDir, tool);
}

export function resolveBundledGogCredentialsPath(): string {
  return path.join(process.resourcesPath, "gog-credentials", "gog-client-secret.json");
}

export function resolveDownloadedGogCredentialsPath(mainDir: string): string {
  // In dev, the entry file compiles to desktop/dist/main.js.
  const appDir = path.resolve(mainDir, "..");
  return path.join(appDir, ".gog-runtime", "credentials", "gog-client-secret.json");
}

export function resolveGogCredentialsPaths(): string[] {
  return getPlatform()
    .appConfigSearchPaths("gogcli")
    .map((dir) => path.join(dir, "credentials.json"));
}

export function resolveRendererIndex(params: {
  isPackaged: boolean;
  appPath: string;
  mainDir: string;
}): string {
  if (params.isPackaged) {
    return path.join(params.appPath, "renderer", "dist", "index.html");
  }
  // dev: entry file is desktop/dist/main.js
  return path.join(path.resolve(params.mainDir, ".."), "renderer", "dist", "index.html");
}

export function resolvePreloadPath(mainDir: string): string {
  return path.join(mainDir, "preload.js");
}
