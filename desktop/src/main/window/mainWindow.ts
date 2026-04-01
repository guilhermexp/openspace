import { app, BrowserWindow, session } from "electron";

function isDevDesktopRuntime(): boolean {
  return !app.isPackaged;
}

function formatRendererConsoleLevel(level: number): "log" | "warn" | "error" {
  if (level === 2) {
    return "warn";
  }
  if (level >= 3) {
    return "error";
  }
  return "log";
}

function attachDevRendererDiagnostics(win: BrowserWindow): void {
  if (!isDevDesktopRuntime()) {
    return;
  }

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const method = formatRendererConsoleLevel(level);
    const location = sourceId ? ` (${sourceId}:${line})` : "";
    console[method](`[renderer:${method}] ${message}${location}`);
  });

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(
        `[renderer:did-fail-load] code=${errorCode} mainFrame=${String(isMainFrame)} url=${validatedURL} error=${errorDescription}`
      );
    }
  );

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `[renderer:gone] reason=${details.reason} exitCode=${String(details.exitCode)}`
    );
  });

  win.webContents.on("unresponsive", () => {
    console.error("[renderer:unresponsive] main window renderer stopped responding");
  });

  win.webContents.on("responsive", () => {
    console.log("[renderer:responsive] main window renderer recovered");
  });

  win.webContents.on("dom-ready", () => {
    console.log("[renderer:dom-ready] main window DOM ready");
  });
}

export async function createMainWindow(params: {
  preloadPath: string;
  rendererIndex: string;
  iconPath?: string;
}): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 950,
    height: 650,
    minWidth: 950,
    minHeight: 650,
    ...(params.iconPath ? { icon: params.iconPath } : {}),

    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: params.preloadPath,
      sandbox: true,
      contextIsolation: true,
    },
  });

  attachDevRendererDiagnostics(win);

  // Strip frame-ancestors from gateway CSP responses so the control UI
  // can be loaded inside an iframe from the file:// renderer origin.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    for (const key of Object.keys(headers)) {
      const lk = key.toLowerCase();
      if (lk === "content-security-policy") {
        headers[key] = headers[key]!.map((v) =>
          v.replace(/\s*frame-ancestors[^;]*(;|$)/g, "$1").replace(/^;\s*/, "")
        );
      }
      if (lk === "x-frame-options") {
        delete headers[key];
      }
    }
    callback({ responseHeaders: headers });
  });

  await win.loadFile(params.rendererIndex);

  return win;
}
