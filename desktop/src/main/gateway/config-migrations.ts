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

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

function ensureObject(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = root[key];
  if (isPlainObject(existing)) return existing;
  const obj: Record<string, unknown> = {};
  root[key] = obj;
  return obj;
}

function mergeMissing(target: Record<string, unknown>, source: Record<string, unknown>): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (existing === undefined) {
      target[key] = structuredClone(value);
      changed = true;
      continue;
    }
    if (isPlainObject(existing) && isPlainObject(value)) {
      if (mergeMissing(existing, value)) {
        changed = true;
      }
    }
  }
  return changed;
}

function hasOwnKey(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

const INTERPRETER_SAFE_BINS = new Set([
  "python",
  "python3",
  "node",
  "bun",
  "deno",
  "ruby",
  "perl",
  "php",
  "lua",
  "pwsh",
  "powershell",
  "zsh",
  "bash",
  "sh",
  "cmd",
]);

const INTERPRETER_SAFE_BIN_PATTERNS = [
  /^python\d+(\.\d+)?$/,
  /^node\d+$/,
  /^bun\d+$/,
  /^deno\d+$/,
  /^ruby\d+(\.\d+)?$/,
  /^php\d+(\.\d+)?$/,
];

const WIN32_UNSUPPORTED_SAFE_BINS = new Set(["memo", "remindctl"]);

function normalizeSafeBinName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isNonEmptyString(value: string | null): value is string {
  return value !== null;
}

function isInterpreterLikeSafeBin(name: string): boolean {
  if (INTERPRETER_SAFE_BINS.has(name)) return true;
  return INTERPRETER_SAFE_BIN_PATTERNS.some((pattern) => pattern.test(name));
}

function isUnsupportedOnCurrentPlatform(name: string): boolean {
  return process.platform === "win32" && WIN32_UNSUPPORTED_SAFE_BINS.has(name);
}

function hasProfileForBin(profiles: Record<string, unknown>, bin: string): boolean {
  return Object.keys(profiles).some((key) => normalizeSafeBinName(key) === bin);
}

function applySafeBinProfileScaffold(exec: Record<string, unknown>): boolean {
  const configuredSafeBins = Array.isArray(exec.safeBins) ? exec.safeBins : [];
  const safeBins = Array.from(
    new Set(configuredSafeBins.map((entry) => normalizeSafeBinName(entry)).filter(isNonEmptyString))
  );
  if (safeBins.length === 0) {
    return false;
  }

  let changed = false;
  const existingProfiles = asPlainObject(exec.safeBinProfiles);
  let profiles = existingProfiles;
  const ensureProfiles = () => {
    if (profiles) return profiles;
    profiles = {};
    exec.safeBinProfiles = profiles;
    changed = true;
    return profiles;
  };

  for (const bin of safeBins) {
    if (isInterpreterLikeSafeBin(bin) || isUnsupportedOnCurrentPlatform(bin)) {
      continue;
    }
    const holder = ensureProfiles();
    if (hasProfileForBin(holder, bin)) {
      continue;
    }
    holder[bin] = {};
    changed = true;
  }

  return changed;
}

type PreviewStreamingMode = "off" | "partial" | "block";
type StreamingMode = PreviewStreamingMode | "progress";

function normalizeStreamingMode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function parseStreamingMode(value: unknown): StreamingMode | null {
  const normalized = normalizeStreamingMode(value);
  if (
    normalized === "off" ||
    normalized === "partial" ||
    normalized === "block" ||
    normalized === "progress"
  ) {
    return normalized;
  }
  return null;
}

function resolveTelegramStreamingMode(entry: Record<string, unknown>): PreviewStreamingMode {
  const parsedStreaming = parseStreamingMode(entry.streaming);
  if (parsedStreaming) {
    return parsedStreaming === "progress" ? "partial" : parsedStreaming;
  }

  const parsedLegacy = parseStreamingMode(entry.streamMode);
  if (parsedLegacy) {
    return parsedLegacy === "progress" ? "partial" : parsedLegacy;
  }

  if (typeof entry.streaming === "boolean") {
    return entry.streaming ? "partial" : "off";
  }

  return "partial";
}

function resolveDiscordStreamingMode(entry: Record<string, unknown>): PreviewStreamingMode {
  const parsedStreaming = parseStreamingMode(entry.streaming);
  if (parsedStreaming) {
    return parsedStreaming === "progress" ? "partial" : parsedStreaming;
  }

  const parsedLegacy = parseStreamingMode(entry.streamMode);
  if (parsedLegacy) {
    return parsedLegacy === "progress" ? "partial" : parsedLegacy;
  }

  if (typeof entry.streaming === "boolean") {
    return entry.streaming ? "partial" : "off";
  }

  return "off";
}

function resolveSlackStreamingMode(entry: Record<string, unknown>): StreamingMode {
  const parsedStreaming = parseStreamingMode(entry.streaming);
  if (parsedStreaming) {
    return parsedStreaming;
  }

  const normalizedLegacy = normalizeStreamingMode(entry.streamMode);
  if (normalizedLegacy === "append") {
    return "block";
  }
  if (normalizedLegacy === "status_final") {
    return "progress";
  }
  if (normalizedLegacy === "replace") {
    return "partial";
  }

  if (typeof entry.streaming === "boolean") {
    return entry.streaming ? "partial" : "off";
  }

  return "partial";
}

function resolveSlackNativeTransport(entry: Record<string, unknown>): boolean {
  if (typeof entry.nativeStreaming === "boolean") {
    return entry.nativeStreaming;
  }
  if (typeof entry.streaming === "boolean") {
    return entry.streaming;
  }
  return true;
}

function migrateLegacyStreamingEntry(
  entry: Record<string, unknown>,
  options: {
    resolveMode: (entry: Record<string, unknown>) => string;
    includeDraftChunk: boolean;
    resolveNativeTransport?: (entry: Record<string, unknown>) => boolean;
  }
): boolean {
  let changed = false;
  const legacyStreaming = entry.streaming;
  const legacyInput = {
    ...entry,
    streaming: legacyStreaming,
  };
  const hadLegacyStreamMode = hasOwnKey(entry, "streamMode");
  const hadLegacyStreamingScalar =
    typeof legacyStreaming === "string" || typeof legacyStreaming === "boolean";

  if (hadLegacyStreamMode || hadLegacyStreamingScalar) {
    const streaming = ensureObject(entry, "streaming");
    if (!hasOwnKey(streaming, "mode")) {
      streaming.mode = options.resolveMode(legacyInput);
    }
    if (hadLegacyStreamMode) {
      delete entry.streamMode;
    }
    changed = true;
  }

  if (hasOwnKey(entry, "chunkMode")) {
    const streaming = ensureObject(entry, "streaming");
    if (!hasOwnKey(streaming, "chunkMode")) {
      streaming.chunkMode = entry.chunkMode;
    }
    delete entry.chunkMode;
    changed = true;
  }

  if (hasOwnKey(entry, "blockStreaming")) {
    const block = ensureObject(ensureObject(entry, "streaming"), "block");
    if (!hasOwnKey(block, "enabled")) {
      block.enabled = entry.blockStreaming;
    }
    delete entry.blockStreaming;
    changed = true;
  }

  if (options.includeDraftChunk && hasOwnKey(entry, "draftChunk")) {
    const preview = ensureObject(ensureObject(entry, "streaming"), "preview");
    if (!hasOwnKey(preview, "chunk")) {
      preview.chunk = entry.draftChunk;
    }
    delete entry.draftChunk;
    changed = true;
  }

  if (hasOwnKey(entry, "blockStreamingCoalesce")) {
    const block = ensureObject(ensureObject(entry, "streaming"), "block");
    if (!hasOwnKey(block, "coalesce")) {
      block.coalesce = entry.blockStreamingCoalesce;
    }
    delete entry.blockStreamingCoalesce;
    changed = true;
  }

  if (options.resolveNativeTransport && hasOwnKey(entry, "nativeStreaming")) {
    const streaming = ensureObject(entry, "streaming");
    if (!hasOwnKey(streaming, "nativeTransport")) {
      streaming.nativeTransport = options.resolveNativeTransport(legacyInput);
    }
    delete entry.nativeStreaming;
    changed = true;
  } else if (
    options.resolveNativeTransport &&
    typeof legacyStreaming === "boolean" &&
    isPlainObject(entry.streaming)
  ) {
    const streaming = entry.streaming;
    if (!hasOwnKey(streaming, "nativeTransport")) {
      streaming.nativeTransport = options.resolveNativeTransport(legacyInput);
      changed = true;
    }
  }

  return changed;
}

function migrateLegacyChannelStreaming(cfg: Record<string, unknown>): boolean {
  const channels = asPlainObject(cfg.channels);
  if (!channels) {
    return false;
  }

  let changed = false;
  const migrateAccountEntries = (
    channel: Record<string, unknown> | undefined,
    migrateEntry: (entry: Record<string, unknown>) => boolean
  ) => {
    const accounts = asPlainObject(channel?.accounts);
    if (!accounts) {
      return;
    }
    for (const account of Object.values(accounts)) {
      const entry = asPlainObject(account);
      if (entry && migrateEntry(entry)) {
        changed = true;
      }
    }
  };

  const telegram = asPlainObject(channels.telegram);
  if (
    telegram &&
    migrateLegacyStreamingEntry(telegram, {
      resolveMode: resolveTelegramStreamingMode,
      includeDraftChunk: true,
    })
  ) {
    changed = true;
  }
  migrateAccountEntries(telegram, (entry) =>
    migrateLegacyStreamingEntry(entry, {
      resolveMode: resolveTelegramStreamingMode,
      includeDraftChunk: true,
    })
  );

  const discord = asPlainObject(channels.discord);
  if (
    discord &&
    migrateLegacyStreamingEntry(discord, {
      resolveMode: resolveDiscordStreamingMode,
      includeDraftChunk: true,
    })
  ) {
    changed = true;
  }
  migrateAccountEntries(discord, (entry) =>
    migrateLegacyStreamingEntry(entry, {
      resolveMode: resolveDiscordStreamingMode,
      includeDraftChunk: true,
    })
  );

  const slack = asPlainObject(channels.slack);
  if (
    slack &&
    migrateLegacyStreamingEntry(slack, {
      resolveMode: resolveSlackStreamingMode,
      includeDraftChunk: false,
      resolveNativeTransport: resolveSlackNativeTransport,
    })
  ) {
    changed = true;
  }
  migrateAccountEntries(slack, (entry) =>
    migrateLegacyStreamingEntry(entry, {
      resolveMode: resolveSlackStreamingMode,
      includeDraftChunk: false,
      resolveNativeTransport: resolveSlackNativeTransport,
    })
  );

  return changed;
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
  {
    version: 3,
    description:
      "Scaffold missing tools.exec.safeBinProfiles entries from configured safeBins (platform-aware)",
    apply: (cfg) => {
      let changed = false;

      const globalExec = asPlainObject(asPlainObject(cfg.tools)?.exec);
      if (globalExec && applySafeBinProfileScaffold(globalExec)) {
        changed = true;
      }

      const agentsList = asPlainObject(cfg.agents)?.list;
      if (Array.isArray(agentsList)) {
        for (const agent of agentsList) {
          const exec = asPlainObject(asPlainObject(asPlainObject(agent)?.tools)?.exec);
          if (exec && applySafeBinProfileScaffold(exec)) {
            changed = true;
          }
        }
      }

      return changed;
    },
  },
  {
    version: 4,
    description: "Set explicit tools.exec defaults (host=gateway, security=allowlist, ask=on-miss)",
    apply: (cfg) => {
      const tools = ensureObject(cfg, "tools");
      const exec = ensureObject(tools, "exec");
      let changed = false;

      if (typeof exec.host !== "string" || !exec.host.trim()) {
        exec.host = "gateway";
        changed = true;
      }
      if (typeof exec.security !== "string" || !exec.security.trim()) {
        exec.security = "allowlist";
        changed = true;
      }
      if (typeof exec.ask !== "string" || !exec.ask.trim()) {
        exec.ask = "on-miss";
        changed = true;
      }

      return changed;
    },
  },
  {
    version: 5,
    description: "Move legacy top-level tts config into messages.tts",
    apply: (cfg) => {
      const legacyTts = asPlainObject(cfg.tts);
      if (!legacyTts) {
        return false;
      }

      const messages = ensureObject(cfg, "messages");
      const currentTts = asPlainObject(messages.tts);
      if (!currentTts) {
        messages.tts = structuredClone(legacyTts);
        delete cfg.tts;
        return true;
      }

      const changed = mergeMissing(currentTts, legacyTts);
      delete cfg.tts;
      return changed || !("tts" in cfg);
    },
  },
  {
    version: 6,
    description: "Normalize legacy channel streaming aliases before gateway startup",
    apply: (cfg) => migrateLegacyChannelStreaming(cfg),
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
