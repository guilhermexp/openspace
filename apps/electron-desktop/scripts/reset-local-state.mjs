import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const yes = args.has("--yes");

function resolveElectronUserDataDir(appName) {
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, appName);
  }
  // linux and others
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, appName);
}

function safeRmrf(target) {
  if (!target || typeof target !== "string") {
    throw new Error("invalid target path");
  }
  const normalized = path.resolve(target);
  // Safety guard: only allow deleting paths that clearly belong to OpenClaw/Electron wrapper.
  const allowedMarkers = [path.sep + ".openclaw", path.sep + "openclaw-electron-desktop"];
  if (!allowedMarkers.some((m) => normalized.includes(m))) {
    throw new Error(`refusing to delete unexpected path: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
}

const openclawStateDir = path.join(os.homedir(), ".openclaw");
const electronUserDataDir = resolveElectronUserDataDir("openclaw-electron-desktop");

const targets = [
  { label: "OpenClaw state", path: openclawStateDir },
  { label: "Electron userData", path: electronUserDataDir },
];

console.log("[electron-desktop] Local state reset");
for (const t of targets) {
  const exists = fs.existsSync(t.path);
  console.log(`- ${t.label}: ${t.path}${exists ? "" : " (missing)"}`);
}

if (!yes) {
  console.log("");
  console.log("Dry run only. Re-run with --yes to delete these directories.");
  process.exit(0);
}

for (const t of targets) {
  if (!fs.existsSync(t.path)) {
    continue;
  }
  console.log(`Deleting: ${t.path}`);
  safeRmrf(t.path);
}

console.log("Done.");

