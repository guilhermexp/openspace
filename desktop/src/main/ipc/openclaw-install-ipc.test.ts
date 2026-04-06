import { beforeEach, describe, expect, it, vi } from "vitest";

const pathMocks = vi.hoisted(() => ({
  resolveGlobalOpenClaw: vi.fn(),
}));

const execMocks = vi.hoisted(() => ({
  runCommand: vi.fn(),
}));

vi.mock("../openclaw/paths", () => ({
  resolveGlobalOpenClaw: pathMocks.resolveGlobalOpenClaw,
}));

vi.mock("./exec", () => ({
  runCommand: execMocks.runCommand,
}));

import { checkOpenClawInstalled, installOpenClaw } from "./openclaw-install-ipc";

describe("openclaw install IPC helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports installation status from resolveGlobalOpenClaw", () => {
    pathMocks.resolveGlobalOpenClaw.mockReturnValue({
      bin: "/mock/bin/openclaw",
      dir: "/mock/lib/node_modules/openclaw",
    });

    expect(checkOpenClawInstalled()).toEqual({
      installed: true,
      bin: "/mock/bin/openclaw",
      dir: "/mock/lib/node_modules/openclaw",
    });
  });

  it("returns a manual fallback result when npm install fails", async () => {
    execMocks.runCommand.mockResolvedValue({
      ok: false,
      code: 1,
      stdout: "",
      stderr: "npm failed",
      resolvedPath: "npm",
    });
    pathMocks.resolveGlobalOpenClaw.mockReturnValue(null);

    await expect(installOpenClaw()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        installed: false,
        needsManualInstall: true,
        stderr: "npm failed",
      })
    );
  });

  it("runs onboarding after npm install succeeds", async () => {
    execMocks.runCommand
      .mockResolvedValueOnce({
        ok: true,
        code: 0,
        stdout: "installed",
        stderr: "",
        resolvedPath: "npm",
      })
      .mockResolvedValueOnce({
        ok: true,
        code: 0,
        stdout: "onboarded",
        stderr: "",
        resolvedPath: "/mock/bin/openclaw",
      });
    pathMocks.resolveGlobalOpenClaw
      .mockReturnValueOnce({
        bin: "/mock/bin/openclaw",
        dir: "/mock/lib/node_modules/openclaw",
      })
      .mockReturnValueOnce({
        bin: "/mock/bin/openclaw",
        dir: "/mock/lib/node_modules/openclaw",
      });

    await expect(installOpenClaw()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        installed: true,
        stdout: "installed\nonboarded",
        needsManualInstall: false,
      })
    );
    expect(execMocks.runCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        bin: "/mock/bin/openclaw",
        args: ["onboard", "--install-daemon"],
      })
    );
  });
});
