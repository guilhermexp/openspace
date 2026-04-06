import { app, type BrowserWindow } from "electron";
import { randomBytes } from "node:crypto";
import * as path from "node:path";

import type { AppState } from "../app-state";
import type { Platform } from "../platform";
import type { BinaryPaths } from "../types";
import { DEFAULT_PORT } from "../constants";
import { readConsentAccepted, writeConsentAccepted } from "../consent";
import { reclaimDefaultPortFromGlobalGatewayForDev } from "./dev-global-gateway";
import { runConfigMigrations } from "../gateway/config-migrations";
import { runExecApprovalsMigrations } from "../gateway/exec-approvals-migrations";
import { ensureGatewayConfigFile, readGatewayTokenFromConfig } from "../gateway/config";
import { broadcastGatewayState, createGatewayStarter } from "../gateway/lifecycle";
import { killOrphanedGateway, removeStaleGatewayLock } from "../gateway/pid-file";
import { registerIpcHandlers } from "../ipc/register";
import {
  resolveBin,
  resolveGlobalOpenClaw,
  resolvePreloadPath,
  resolveRendererIndex,
} from "../openclaw/paths";
import { registerTerminalIpcHandlers } from "../terminal/ipc";
import { createTailBuffer, pickPort } from "../util/net";
import { killUpdateSplash } from "../update-splash";
import { cleanupAudioCache } from "../audio-cache";
import { initAutoUpdater } from "../updater";

type EnsureWindow = () => Promise<BrowserWindow | null>;
type EnsureTray = () => void;

export async function bootstrapApp(params: {
  gotTheLock: boolean;
  state: AppState;
  mainDir: string;
  platform: Platform;
  ensureWindow: EnsureWindow;
  ensureTray: EnsureTray;
  stopGatewayChild: () => Promise<void>;
}): Promise<void> {
  console.log("[bootstrap] gotTheLock =", params.gotTheLock);
  if (!params.gotTheLock) {
    console.log("[bootstrap] another instance is running, quitting");
    return;
  }

  const userData = app.getPath("userData");
  console.log("[bootstrap] userData =", userData);
  const stateDir = path.join(userData, "openclaw");
  params.state.gatewayStateDir = stateDir;
  const whisperDataDir = path.join(userData, "whisper");
  const logsDir = path.join(userData, "logs");
  params.state.logsDirForUi = logsDir;

  const killedPid = killOrphanedGateway(stateDir);
  if (killedPid) {
    console.log(`[main] Cleaned up orphaned gateway process (PID ${killedPid})`);
  }
  // TODO: remove after 1-2 releases once orphan cleanup is proven reliable.
  // Skip in e2e: parallel test workers each spawn their own gateway;
  // a blanket pkill would tear down sibling instances.
  if (!process.env.OPENSPACE_E2E_USER_DATA) {
    try {
      params.platform.killAllByName("openclaw-gateway");
      console.log("[main] killed lingering openclaw-gateway processes");
    } catch {
      // No matching processes found — expected.
    }
  }

  const configPath = path.join(stateDir, "openclaw.json");
  removeStaleGatewayLock(configPath);

  const openclawRuntime = resolveGlobalOpenClaw();
  const openclawDir = openclawRuntime?.dir ?? stateDir;
  const binOpts = { isPackaged: app.isPackaged, mainDir: params.mainDir };
  const bins: BinaryPaths = {
    gogBin: resolveBin("gog", binOpts),
    jqBin: resolveBin("jq", binOpts),
    memoBin: resolveBin("memo", binOpts),
    remindctlBin: resolveBin("remindctl", binOpts),
    obsidianCliBin: resolveBin("obsidian-cli", binOpts),
    ghBin: resolveBin("gh", binOpts),
    whisperCliBin: resolveBin("whisper-cli", binOpts),
  };

  await reclaimDefaultPortFromGlobalGatewayForDev({
    preferredPort: DEFAULT_PORT,
    isPackaged: app.isPackaged,
    platformName: params.platform.name,
  });

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  let token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });
  runConfigMigrations({ configPath, stateDir });
  runExecApprovalsMigrations({ stateDir });

  const rendererIndex = resolveRendererIndex({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDir: params.mainDir,
  });
  params.state.preloadPath = resolvePreloadPath(params.mainDir);
  params.state.rendererIndex = rendererIndex;

  const consentPath = path.join(stateDir, "consent.json");
  params.state.consentAccepted = readConsentAccepted(consentPath);

  const stderrTail = createTailBuffer(24_000);
  const startGateway = createGatewayStarter({
    ...bins,
    state: params.state,
    platform: params.platform,
    stderrTail,
    ensureWindow: params.ensureWindow,
    port,
    logsDir,
    stateDir,
    configPath,
    getToken: () => token,
    url,
    resolveOpenClaw: resolveGlobalOpenClaw,
    whisperDataDir,
  });

  // Register IPC handlers before opening the window so the renderer can call
  // them immediately on load without hitting "No handler registered" errors.
  registerIpcHandlers({
    ...bins,
    getMainWindow: () => params.state.mainWindow,
    getGatewayState: () => params.state.gatewayState,
    getLogsDir: () => params.state.logsDirForUi,
    getConsentAccepted: () => params.state.consentAccepted,
    acceptConsent: async () => {
      params.state.consentAccepted = true;
      writeConsentAccepted(consentPath);
    },
    startGateway,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    whisperDataDir,
    stopGatewayChild: params.stopGatewayChild,
    getGatewayToken: () => token,
    setGatewayToken: (t: string) => {
      token = t;
    },
  });

  registerTerminalIpcHandlers({
    ...bins,
    getMainWindow: () => params.state.mainWindow,
    stateDir,
    resolveOpenclawBin: () => resolveGlobalOpenClaw()?.bin ?? null,
  });

  const mainWindow = await params.ensureWindow();
  params.ensureTray();

  killUpdateSplash();
  if (app.isPackaged) {
    initAutoUpdater(() => params.state.mainWindow);
  }

  // Prune audio cache files older than 2 days (non-blocking, best-effort).
  cleanupAudioCache(userData).catch(() => {});

  if (!openclawRuntime) {
    console.log("[bootstrap] global openclaw not found; waiting for onboarding install flow");
    broadcastGatewayState(
      mainWindow,
      { kind: "missing-runtime", port, logsDir, token },
      params.state
    );
    return;
  }

  console.log("[bootstrap] starting gateway on port", port);
  await startGateway();
  console.log("[bootstrap] gateway started successfully");
}
