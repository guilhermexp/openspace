import { BrowserWindow, session } from "electron";

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

  // Strip frame-ancestors from gateway CSP responses so the control UI
  // can be loaded inside an iframe from the file:// renderer origin.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    for (const key of Object.keys(headers)) {
      const lk = key.toLowerCase();
      if (lk === "content-security-policy") {
        headers[key] = headers[key]!.map((v) =>
          v.replace(/\s*frame-ancestors[^;]*(;|$)/g, "$1").replace(/^;\s*/, ""),
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
