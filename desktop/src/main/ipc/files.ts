/**
 * IPC handlers for file/folder operations and devtools.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ipcMain, shell } from "electron";

import { IPC } from "../../shared/ipc-channels";
import type { DesktopOpenTarget, DesktopPlatform } from "../../shared/desktop-bridge-contract";
import { resolvePreviewFilePath } from "./file-reader";
import type { FileHandlerParams } from "./types";

type AppCandidate = {
  id: string;
  label: string;
  appName: string;
};

const MACOS_APP_CANDIDATES: AppCandidate[] = [
  { id: "safari", label: "Safari", appName: "Safari" },
  { id: "chrome", label: "Google Chrome", appName: "Google Chrome" },
  { id: "arc", label: "Arc", appName: "Arc" },
  { id: "firefox", label: "Firefox", appName: "Firefox" },
  { id: "cursor", label: "Cursor", appName: "Cursor" },
  { id: "zed", label: "Zed", appName: "Zed" },
  { id: "vscode", label: "VS Code", appName: "Visual Studio Code" },
  { id: "windsurf", label: "Windsurf", appName: "Windsurf" },
  { id: "sublime", label: "Sublime Text", appName: "Sublime Text" },
  { id: "xcode", label: "Xcode", appName: "Xcode" },
  { id: "terminal", label: "Terminal", appName: "Terminal" },
  { id: "iterm", label: "iTerm", appName: "iTerm" },
  { id: "warp", label: "Warp", appName: "Warp" },
];

function isLikelyLocalFileTarget(value: string): boolean {
  return (
    value === "~" ||
    value.startsWith("~/") ||
    value.startsWith("~\\") ||
    value.startsWith("/") ||
    value.startsWith("file://") ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getDesktopPlatform(): DesktopPlatform {
  if (process.platform === "darwin" || process.platform === "win32" || process.platform === "linux") {
    return process.platform;
  }
  return "linux";
}

function isInstalledMacApp(appName: string): boolean {
  const appBundle = `${appName}.app`;
  const searchRoots = ["/Applications", path.join(os.homedir(), "Applications")];
  return searchRoots.some((root) => fs.existsSync(path.join(root, appBundle)));
}

function getMacAppName(targetId: string): string | null {
  return MACOS_APP_CANDIDATES.find((candidate) => candidate.id === targetId)?.appName ?? null;
}

export function getAvailableOpenTargets(
  _filePath: string,
  options?: { platform?: DesktopPlatform }
): DesktopOpenTarget[] {
  const platform = options?.platform ?? getDesktopPlatform();
  const targets: DesktopOpenTarget[] = [{ id: "default", label: "Default app", kind: "default" }];

  if (platform !== "darwin") {
    return targets;
  }

  targets.push({ id: "finder", label: "Finder", kind: "finder" });

  for (const candidate of MACOS_APP_CANDIDATES) {
    if (isInstalledMacApp(candidate.appName)) {
      targets.push({ id: candidate.id, label: candidate.label, kind: "app" });
    }
  }

  return targets;
}

async function openLocalFileTarget(filePath: string, targetId: string): Promise<void> {
  const resolvedPath = resolvePreviewFilePath(filePath);

  if (targetId === "default") {
    const openPathError = await shell.openPath(resolvedPath);
    if (openPathError) {
      throw new Error(openPathError);
    }
    return;
  }

  if (process.platform !== "darwin") {
    throw new Error("Open with specific apps is only implemented on macOS for now.");
  }

  if (targetId === "finder") {
    await execFileAsync("open", ["-R", resolvedPath]);
    return;
  }

  const appName = getMacAppName(targetId);
  if (!appName) {
    throw new Error(`Unknown open target: ${targetId}`);
  }

  await execFileAsync("open", ["-a", appName, resolvedPath]);
}

export function registerFileHandlers(params: FileHandlerParams) {
  ipcMain.handle(IPC.openLogs, async () => {
    const logsDir = params.getLogsDir();
    if (!logsDir) {
      return;
    }
    await shell.openPath(logsDir);
  });

  ipcMain.handle(IPC.openWorkspaceFolder, async () => {
    const workspaceDir = path.join(params.stateDir, "workspace");
    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
    } catch (err) {
      console.warn("[ipc/files] mkdir workspace failed:", err);
    }
    await shell.openPath(workspaceDir);
  });

  ipcMain.handle(IPC.openOpenclawFolder, async () => {
    try {
      fs.mkdirSync(params.stateDir, { recursive: true });
    } catch (err) {
      console.warn("[ipc/files] mkdir stateDir failed:", err);
    }
    await shell.openPath(params.stateDir);
  });

  ipcMain.handle(IPC.devtoolsToggle, async () => {
    const win = params.getMainWindow();
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

  ipcMain.handle(IPC.openExternal, async (_evt, p: { url?: unknown }) => {
    const url = typeof p?.url === "string" ? p.url : "";
    if (!url) {
      return;
    }
    if (isLikelyLocalFileTarget(url)) {
      const resolvedPath = resolvePreviewFilePath(url);
      const openPathError = await shell.openPath(resolvedPath);
      if (openPathError) {
        throw new Error(openPathError);
      }
      return;
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC.listOpenTargets, async (_evt, p: { filePath?: unknown }) => {
    const filePath = typeof p?.filePath === "string" ? p.filePath.trim() : "";
    if (!filePath) {
      return { error: "A file path is required." };
    }
    return { targets: getAvailableOpenTargets(filePath) };
  });

  ipcMain.handle(IPC.openFileWith, async (_evt, p: { filePath?: unknown; targetId?: unknown }) => {
    const filePath = typeof p?.filePath === "string" ? p.filePath.trim() : "";
    const targetId = typeof p?.targetId === "string" ? p.targetId.trim() : "";
    if (!filePath) {
      return { error: "A file path is required." };
    }
    if (!targetId) {
      return { error: "An open target is required." };
    }

    try {
      await openLocalFileTarget(filePath, targetId);
      return { ok: true };
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to open file with the selected app.";
      return { error: message };
    }
  });

  ipcMain.handle(IPC.focusWindow, async () => {
    const win = params.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    // blur() before focus() is required to work around an Electron bug where
    // native dialogs (alert/confirm) break window focus on Windows.
    // See: electron/electron#31917, electron/electron#41603
    win.blur();
    win.focus();
  });
}
