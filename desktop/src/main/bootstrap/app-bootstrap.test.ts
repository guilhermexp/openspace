import { app } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAppState } from "../app-state";
import { DEFAULT_PORT } from "../constants";

const mocks = vi.hoisted(() => ({
  readConsentAccepted: vi.fn(() => true),
  writeConsentAccepted: vi.fn(),
  runConfigMigrations: vi.fn(),
  runExecApprovalsMigrations: vi.fn(),
  ensureGatewayConfigFile: vi.fn(),
  readGatewayTokenFromConfig: vi.fn(() => "token-from-config"),
  broadcastGatewayState: vi.fn(),
  createGatewayStarter: vi.fn(),
  killOrphanedGateway: vi.fn(() => null),
  removeStaleGatewayLock: vi.fn(),
  registerIpcHandlers: vi.fn(),
  resolveBin: vi.fn((name: string) => `/bin/${name}`),
  resolveGlobalOpenClaw: vi.fn(() => ({ bin: "/bin/openclaw", dir: "/mock/openclaw" })),
  resolvePreloadPath: vi.fn(() => "/mock/preload.js"),
  resolveRendererIndex: vi.fn(() => "/mock/index.html"),
  registerTerminalIpcHandlers: vi.fn(),
  createTailBuffer: vi.fn(() => ({ push: vi.fn(), read: vi.fn(() => "") })),
  pickPort: vi.fn(async () => 18789),
  killUpdateSplash: vi.fn(),
  initAutoUpdater: vi.fn(),
  reclaimDefaultPortFromGlobalGatewayForDev: vi.fn(async () => false),
}));

vi.mock("../consent", () => ({
  readConsentAccepted: mocks.readConsentAccepted,
  writeConsentAccepted: mocks.writeConsentAccepted,
}));
vi.mock("../gateway/config-migrations", () => ({
  runConfigMigrations: mocks.runConfigMigrations,
}));
vi.mock("../gateway/exec-approvals-migrations", () => ({
  runExecApprovalsMigrations: mocks.runExecApprovalsMigrations,
}));
vi.mock("../gateway/config", () => ({
  ensureGatewayConfigFile: mocks.ensureGatewayConfigFile,
  readGatewayTokenFromConfig: mocks.readGatewayTokenFromConfig,
}));
vi.mock("../gateway/lifecycle", () => ({
  broadcastGatewayState: mocks.broadcastGatewayState,
  createGatewayStarter: mocks.createGatewayStarter,
}));
vi.mock("../gateway/pid-file", () => ({
  killOrphanedGateway: mocks.killOrphanedGateway,
  removeStaleGatewayLock: mocks.removeStaleGatewayLock,
}));
vi.mock("../ipc/register", () => ({ registerIpcHandlers: mocks.registerIpcHandlers }));
vi.mock("../openclaw/paths", () => ({
  resolveBin: mocks.resolveBin,
  resolveGlobalOpenClaw: mocks.resolveGlobalOpenClaw,
  resolvePreloadPath: mocks.resolvePreloadPath,
  resolveRendererIndex: mocks.resolveRendererIndex,
}));
vi.mock("../terminal/ipc", () => ({
  registerTerminalIpcHandlers: mocks.registerTerminalIpcHandlers,
}));
vi.mock("../util/net", () => ({
  createTailBuffer: mocks.createTailBuffer,
  pickPort: mocks.pickPort,
}));
vi.mock("../update-splash", () => ({ killUpdateSplash: mocks.killUpdateSplash }));
vi.mock("../updater", () => ({ initAutoUpdater: mocks.initAutoUpdater }));
vi.mock("./dev-global-gateway", () => ({
  reclaimDefaultPortFromGlobalGatewayForDev: mocks.reclaimDefaultPortFromGlobalGatewayForDev,
}));

import { bootstrapApp } from "./app-bootstrap";

describe("bootstrapApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app.isPackaged = false;
    vi.mocked(app.getPath).mockImplementation((name: string) => `/mock/${name}`);
  });

  it("returns early when lock is missing", async () => {
    const state = createAppState();
    await bootstrapApp({
      gotTheLock: false,
      state,
      mainDir: "/mock/main",
      platform: { name: "darwin", killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });
    expect(mocks.pickPort).not.toHaveBeenCalled();
    expect(mocks.registerIpcHandlers).not.toHaveBeenCalled();
  });

  it("wires app bootstrap and starts gateway", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    const ensureWindow = vi.fn(async () => null);
    const ensureTray = vi.fn();

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { name: "darwin", killAllByName: vi.fn() } as never,
      ensureWindow,
      ensureTray,
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(mocks.reclaimDefaultPortFromGlobalGatewayForDev).toHaveBeenCalledWith({
      preferredPort: DEFAULT_PORT,
      isPackaged: false,
      platformName: "darwin",
    });
    expect(mocks.pickPort).toHaveBeenCalledWith(DEFAULT_PORT);
    expect(state.gatewayStateDir).toBe("/mock/userData/openclaw");
    expect(state.logsDirForUi).toBe("/mock/userData/logs");
    expect(ensureWindow).toHaveBeenCalled();
    expect(ensureTray).toHaveBeenCalled();
    expect(mocks.registerIpcHandlers).toHaveBeenCalled();
    expect(mocks.registerTerminalIpcHandlers).toHaveBeenCalled();
    expect(startGateway).toHaveBeenCalled();
  });

  it("broadcasts missing-runtime when openclaw is not installed", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    const ensureWindow = vi.fn(async () => null);
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    mocks.resolveGlobalOpenClaw.mockReturnValue(null);

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { name: "darwin", killAllByName: vi.fn() } as never,
      ensureWindow,
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(mocks.broadcastGatewayState).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ kind: "missing-runtime", port: 18789 }),
      state
    );
    expect(startGateway).not.toHaveBeenCalled();
  });
});
