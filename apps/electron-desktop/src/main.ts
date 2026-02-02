import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import JSON5 from "json5";

const DEFAULT_PORT = 18789;
const DEFAULT_AGENT_ID = "main";

const THIS_DIR = __dirname;

let mainWindow: BrowserWindow | null = null;

type GatewayState =
  | { kind: "starting"; port: number; logsDir: string; token: string }
  | { kind: "ready"; port: number; logsDir: string; url: string; token: string }
  | { kind: "failed"; port: number; logsDir: string; details: string; token: string };

function resolveRepoRoot(): string {
  // In dev (running from source), this file compiles to apps/electron-desktop/dist/main.js.
  // We want the repo root to locate openclaw.mjs and dist/.
  return path.resolve(THIS_DIR, "..", "..", "..");
}

function resolveBundledOpenClawDir(): string {
  return path.join(process.resourcesPath, "openclaw");
}

function resolveBundledNodeBin(): string {
  const platform = process.platform;
  const arch = process.arch;
  const base = path.join(process.resourcesPath, "node", `${platform}-${arch}`);
  if (platform === "win32") {
    return path.join(base, "node.exe");
  }
  return path.join(base, "bin", "node");
}

function resolveRendererIndex(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "renderer", "dist", "index.html");
  }
  // dev: this file is apps/electron-desktop/dist/main.js
  return path.join(path.resolve(THIS_DIR, ".."), "renderer", "dist", "index.html");
}

async function waitForPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const done = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
      socket.setTimeout(500, () => done(false));
    });
    if (ok) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function createTailBuffer(maxChars: number) {
  let buf = "";
  return {
    push(chunk: string) {
      buf += chunk;
      if (buf.length > maxChars) {
        buf = buf.slice(buf.length - maxChars);
      }
    },
    read() {
      return buf;
    },
  };
}

async function pickPort(preferred: number): Promise<number> {
  const isFree = await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(preferred, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
  if (isFree) {
    return preferred;
  }
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (e: unknown) => reject(e));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to resolve random port"));
          return;
        }
        resolve(addr.port);
      });
    });
  });
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeAuthProfilesAnthropicApiKey(params: { stateDir: string; apiKey: string }) {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error("apiKey is required");
  }
  const agentDir = path.join(params.stateDir, "agents", DEFAULT_AGENT_ID, "agent");
  const authPath = path.join(agentDir, "auth-profiles.json");
  ensureDir(agentDir);

  let store: {
    version?: number;
    profiles?: Record<string, unknown>;
    order?: Record<string, unknown>;
  } = {};
  try {
    if (fs.existsSync(authPath)) {
      const raw = fs.readFileSync(authPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        store = parsed as typeof store;
      }
    }
  } catch {
    // ignore; we will overwrite with a sane payload
    store = {};
  }

  const profiles = (store.profiles && typeof store.profiles === "object" ? store.profiles : {}) as Record<
    string,
    unknown
  >;
  profiles["anthropic:default"] = { type: "api_key", provider: "anthropic", key };
  const order = (store.order && typeof store.order === "object" ? store.order : {}) as Record<
    string,
    unknown
  >;
  order.anthropic = ["anthropic:default"];

  const payload = {
    version: typeof store.version === "number" ? store.version : 1,
    profiles,
    order,
  };

  const tmp = `${authPath}.${randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf-8" });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // ignore
  }
  fs.renameSync(tmp, authPath);
  try {
    fs.chmodSync(authPath, 0o600);
  } catch {
    // ignore
  }
}

function readGatewayTokenFromConfig(configPath: string): string | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const text = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON5.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const cfg = parsed as {
      gateway?: { auth?: { token?: unknown } };
    };
    const token = cfg.gateway?.auth?.token;
    return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

function ensureGatewayConfigFile(params: { configPath: string; token: string }) {
  if (fs.existsSync(params.configPath)) {
    return;
  }
  ensureDir(path.dirname(params.configPath));
  const minimal = {
    gateway: {
      mode: "local",
      bind: "loopback",
      auth: {
        mode: "token",
        token: params.token,
      },
    },
  };
  // Write JSON (JSON5-compatible) to keep it simple and deterministic.
  fs.writeFileSync(params.configPath, `${JSON.stringify(minimal, null, 2)}\n`, "utf-8");
}

function spawnGateway(params: {
  port: number;
  logsDir: string;
  stateDir: string;
  configPath: string;
  token: string;
  openclawDir: string;
  nodeBin: string;
  stderrTail: ReturnType<typeof createTailBuffer>;
}): ChildProcess {
  const { port, logsDir, stateDir, configPath, token, openclawDir, nodeBin, stderrTail } = params;

  ensureDir(logsDir);
  ensureDir(stateDir);

  const stdoutPath = path.join(logsDir, "gateway.stdout.log");
  const stderrPath = path.join(logsDir, "gateway.stderr.log");
  const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "a" });

  const script = path.join(openclawDir, "openclaw.mjs");
  // Important: first-run embedded app starts without a config file. Allow the Gateway to start
  // so the Control UI/WebChat + wizard flows can create config.
  const args = [script, "gateway", "--bind", "loopback", "--port", String(port), "--allow-unconfigured"];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // In dev mode we spawn the Gateway using the Electron binary (process.execPath). That binary
    // must run in "Node mode" for the child process, otherwise it tries to launch Electron again.
    ELECTRON_RUN_AS_NODE: "1",
    // Keep all OpenClaw state inside the Electron app's userData directory.
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_TOKEN: token,
    // Reduce noise in embedded contexts.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  const child = spawn(nodeBin, args, {
    cwd: openclawDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr.on("data", (chunk) => {
    try {
      stderrTail.push(String(chunk));
    } catch {
      // ignore
    }
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  return child;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(THIS_DIR, "preload.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  await win.loadFile(resolveRendererIndex());

  return win;
}

let gateway: ChildProcess | null = null;
let logsDirForUi: string | null = null;
let gatewayState: GatewayState | null = null;

function broadcastGatewayState(win: BrowserWindow | null, state: GatewayState) {
  gatewayState = state;
  try {
    win?.webContents.send("gateway-state", state);
  } catch {
    // ignore
  }
}

app.on("window-all-closed", () => {
  // macOS convention: keep the app alive until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  const child = gateway;
  gateway = null;
  if (!child) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1500));
  if (!child.killed) {
    child.kill("SIGKILL");
  }
});

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  const stateDir = path.join(userData, "openclaw");
  const logsDir = path.join(userData, "logs");
  logsDirForUi = logsDir;

  ipcMain.handle("open-logs", async () => {
    if (!logsDirForUi) {
      return;
    }
    // Open the logs directory in Finder/Explorer.
    await shell.openPath(logsDirForUi);
  });
  ipcMain.handle("devtools-toggle", async () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) {
      return;
    }
    const wc = win.webContents;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools({ mode: "detach" });
    }
  });
  ipcMain.handle("open-external", async (_evt, params: { url?: unknown }) => {
    const url = typeof params?.url === "string" ? params.url : "";
    if (!url) {
      return;
    }
    await shell.openExternal(url);
  });
  ipcMain.handle("gateway-get-info", async () => ({ state: gatewayState }));
  ipcMain.handle("gateway-retry", async () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("auth-set-anthropic-api-key", async (_evt, params: { apiKey?: unknown }) => {
    const apiKey = typeof params?.apiKey === "string" ? params.apiKey : "";
    writeAuthProfilesAnthropicApiKey({ stateDir, apiKey });
    return { ok: true } as const;
  });

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const configPath = path.join(stateDir, "openclaw.json");
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  const token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });

  const openclawDir = app.isPackaged ? resolveBundledOpenClawDir() : resolveRepoRoot();
  const nodeBin = app.isPackaged ? resolveBundledNodeBin() : process.execPath;

  const stderrTail = createTailBuffer(24_000);
  gateway = spawnGateway({
    port,
    logsDir,
    stateDir,
    configPath,
    token,
    openclawDir,
    nodeBin,
    stderrTail,
  });

  const win = await createMainWindow();
  mainWindow = win;
  broadcastGatewayState(win, { kind: "starting", port, logsDir, token });

  const ok = await waitForPortOpen("127.0.0.1", port, 30_000);
  if (!ok) {
    const details = [
      `Gateway did not open the port within 30s.`,
      "",
      `openclawDir: ${openclawDir}`,
      `nodeBin: ${nodeBin}`,
      `stderr (tail):`,
      stderrTail.read().trim() || "<empty>",
      "",
      `See logs in: ${logsDir}`,
    ].join("\n");
    broadcastGatewayState(win, { kind: "failed", port, logsDir, details, token });
    return;
  }

  // Keep the Electron window on the React renderer. The legacy Control UI is embedded in an iframe
  // and can be switched to/from the native pages without losing the top-level navigation.
  broadcastGatewayState(win, { kind: "ready", port, logsDir, url, token });
});

