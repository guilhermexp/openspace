import * as fs from "node:fs";
import * as path from "node:path";

import JSON5 from "json5";

const STATE_FILENAME = "desktop-state.json";

export type ConfigMigration = {
  version: number;
  description: string;
  /** Mutate `cfg` in-place. Return `true` if anything changed. */
  apply: (cfg: Record<string, unknown>) => boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureObject(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = root[key];
  if (isPlainObject(existing)) return existing;
  const obj: Record<string, unknown> = {};
  root[key] = obj;
  return obj;
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

export const DESKTOP_CONFIG_MIGRATIONS: ConfigMigration[] = [
  {
    version: 1,
    description: "Ensure null origin and device-auth bypass for Electron renderer",
    apply: (cfg) => {
      const gateway = ensureObject(cfg, "gateway");
      const mode = typeof gateway.mode === "string" ? gateway.mode.trim() : "";
      const bind = typeof gateway.bind === "string" ? gateway.bind.trim() : "";
      if (mode !== "local" || bind !== "loopback") return false;

      const controlUi = ensureObject(gateway, "controlUi");
      const allowedOrigins: string[] = Array.isArray(controlUi.allowedOrigins)
        ? controlUi.allowedOrigins.map((v) => String(v).trim()).filter(Boolean)
        : [];

      let changed = false;

      if (!allowedOrigins.includes("null")) {
        allowedOrigins.push("null");
        controlUi.allowedOrigins = allowedOrigins;
        changed = true;
      }
      if (controlUi.dangerouslyDisableDeviceAuth !== true) {
        controlUi.dangerouslyDisableDeviceAuth = true;
        changed = true;
      }
      return changed;
    },
  },
  {
    version: 2,
    description: "Set browser.defaultProfile to openclaw",
    apply: (cfg) => {
      const browser = ensureObject(cfg, "browser");
      if (typeof browser.defaultProfile === "string") return false;
      browser.defaultProfile = "openclaw";
      return true;
    },
  },
];

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function readStateVersion(stateDir: string): number {
  try {
    const statePath = path.join(stateDir, STATE_FILENAME);
    if (!fs.existsSync(statePath)) return 0;
    const raw: unknown = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (isPlainObject(raw) && typeof raw.configVersion === "number") {
      return raw.configVersion;
    }
  } catch {
    // Corrupted or missing — treat as version 0.
  }
  return 0;
}

function writeStateVersion(stateDir: string, version: number): void {
  const statePath = path.join(stateDir, STATE_FILENAME);
  fs.writeFileSync(statePath, `${JSON.stringify({ configVersion: version }, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runConfigMigrations(params: { configPath: string; stateDir: string }): void {
  const { configPath, stateDir } = params;
  if (!fs.existsSync(configPath)) return;

  const currentVersion = readStateVersion(stateDir);
  const pending = DESKTOP_CONFIG_MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  let cfg: Record<string, unknown>;
  try {
    const text = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON5.parse(text);
    if (!isPlainObject(parsed)) return;
    cfg = parsed;
  } catch {
    return;
  }

  let configChanged = false;
  let appliedUpTo = currentVersion;

  for (const migration of pending) {
    try {
      if (migration.apply(cfg)) {
        configChanged = true;
      }
      appliedUpTo = migration.version;
    } catch (err) {
      console.warn(`[config-migrations] v${migration.version} failed:`, err);
      break;
    }
  }

  if (configChanged) {
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
  }
  if (appliedUpTo > currentVersion) {
    writeStateVersion(stateDir, appliedUpTo);
  }
}
