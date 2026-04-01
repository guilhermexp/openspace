import fs from "node:fs";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain, shell } from "electron";

import { getAvailableOpenTargets, registerFileHandlers } from "./files";
import { IPC } from "../../shared/ipc-channels";

function createParams() {
  return {
    getLogsDir: () => "/tmp/logs",
    getMainWindow: () => null,
    stateDir: "/tmp/state",
  };
}

function getHandler(channel: string) {
  const entry = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === channel);
  return entry?.[1];
}

describe("registerFileHandlers", () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
    vi.mocked(shell.openExternal).mockReset();
    vi.mocked(shell.openPath).mockReset();
    vi.mocked(shell.openPath).mockResolvedValue("");
    registerFileHandlers(createParams());
  });

  it("opens local file targets with openPath", async () => {
    const handler = getHandler(IPC.openExternal);

    await handler?.(null, { url: "~/notes.md" });

    expect(shell.openPath).toHaveBeenCalledWith(`${os.homedir()}/notes.md`);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("keeps remote urls on openExternal", async () => {
    const handler = getHandler(IPC.openExternal);

    await handler?.(null, { url: "https://openspace.dev" });

    expect(shell.openExternal).toHaveBeenCalledWith("https://openspace.dev");
    expect(shell.openPath).not.toHaveBeenCalled();
  });
});

describe("getAvailableOpenTargets", () => {
  it("includes default app, Finder, and only installed common apps on macOS", () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockImplementation((candidate) =>
      String(candidate).includes("Google Chrome.app")
    );

    const targets = getAvailableOpenTargets("/tmp/readme.md", {
      platform: "darwin",
    });

    expect(targets).toEqual([
      { id: "default", label: "Default app", kind: "default" },
      { id: "finder", label: "Finder", kind: "finder" },
      { id: "chrome", label: "Google Chrome", kind: "app" },
    ]);

    expect(existsSyncSpy).toHaveBeenCalled();
  });
});
