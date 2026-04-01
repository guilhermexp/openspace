import { describe, expect, it, vi } from "vitest";

import { reclaimDefaultPortFromGlobalGatewayForDev } from "./dev-global-gateway";

describe("reclaimDefaultPortFromGlobalGatewayForDev", () => {
  it("does nothing outside macOS dev", async () => {
    const probePort = vi.fn(async () => true);
    const execFileSync = vi.fn();

    const result = await reclaimDefaultPortFromGlobalGatewayForDev(
      { preferredPort: 1515, isPackaged: true, platformName: "darwin" },
      { probePort, execFileSync, getUid: () => 501, sleep: async () => {} }
    );

    expect(result).toBe(false);
    expect(probePort).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when the preferred port is free", async () => {
    const probePort = vi.fn(async () => false);
    const execFileSync = vi.fn();

    const result = await reclaimDefaultPortFromGlobalGatewayForDev(
      { preferredPort: 1515, isPackaged: false, platformName: "darwin" },
      { probePort, execFileSync, getUid: () => 501, sleep: async () => {} }
    );

    expect(result).toBe(false);
    expect(probePort).toHaveBeenCalledTimes(1);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when the global launch agent is not loaded", async () => {
    const probePort = vi.fn(async () => true);
    const execFileSync = vi.fn(() => {
      throw new Error("not loaded");
    });

    const result = await reclaimDefaultPortFromGlobalGatewayForDev(
      { preferredPort: 1515, isPackaged: false, platformName: "darwin" },
      { probePort, execFileSync, getUid: () => 501, sleep: async () => {} }
    );

    expect(result).toBe(false);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl",
      ["print", "gui/501/ai.openclaw.gateway"],
      expect.any(Object)
    );
  });

  it("unloads the global launch agent when it blocks the preferred port", async () => {
    const probePort = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const execFileSync = vi.fn();
    const log = vi.fn();

    const result = await reclaimDefaultPortFromGlobalGatewayForDev(
      { preferredPort: 1515, isPackaged: false, platformName: "darwin" },
      { probePort, execFileSync, getUid: () => 501, sleep: async () => {}, log, warn: vi.fn() }
    );

    expect(result).toBe(true);
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      "launchctl",
      ["print", "gui/501/ai.openclaw.gateway"],
      expect.any(Object)
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      "launchctl",
      ["bootout", "gui/501/ai.openclaw.gateway"],
      expect.any(Object)
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("unloading global ai.openclaw.gateway")
    );
  });
});
