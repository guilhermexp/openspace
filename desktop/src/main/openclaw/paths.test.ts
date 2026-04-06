/**
 * Tests for path resolution functions in paths.ts.
 */
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn((target: string) => target.startsWith("/mock/")),
}));

vi.mock("node:child_process", () => ({
  spawnSync: childProcessMocks.spawnSync,
}));

vi.mock("node:fs", () => ({
  existsSync: fsMocks.existsSync,
}));

import {
  bundledBin,
  downloadedBin,
  resolveBin,
  resolveBundledGogCredentialsPath,
  resolveDownloadedGogCredentialsPath,
  resolveGlobalOpenClaw,
  resolveGogCredentialsPaths,
  resolvePreloadPath,
  resolveRendererIndex,
} from "./paths";
import { getPlatform } from "../platform";

const MOCK_RESOURCES = "/mock/resources";
Object.defineProperty(process, "resourcesPath", {
  value: MOCK_RESOURCES,
  writable: true,
  configurable: true,
});

const currentPlatform = process.platform;
const arch = process.arch;
const platArch = `${currentPlatform}-${arch}`;
const ext = getPlatform().binaryExtension();

describe("resolveGlobalOpenClaw", () => {
  const originalOpenclawBin = process.env.OPENCLAW_BIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_BIN = "";
    childProcessMocks.spawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "" });
    fsMocks.existsSync.mockImplementation((target: string) => target.startsWith("/mock/"));
  });

  afterAll(() => {
    process.env.OPENCLAW_BIN = originalOpenclawBin;
  });

  it("prefers OPENCLAW_BIN when it points to an existing executable", () => {
    process.env.OPENCLAW_BIN = "/mock/bin/openclaw";
    fsMocks.existsSync.mockImplementation(
      (target: string) =>
        target === "/mock/bin/openclaw" ||
        target === path.resolve("/mock/bin", "..", "lib", "node_modules", "openclaw")
    );

    expect(resolveGlobalOpenClaw()).toEqual({
      bin: "/mock/bin/openclaw",
      dir: "/mock/lib/node_modules/openclaw",
    });
  });

  it("falls back to which/where when OPENCLAW_BIN is not set", () => {
    childProcessMocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: "/mock/bin/openclaw\n",
      stderr: "",
    });
    fsMocks.existsSync.mockImplementation(
      (target: string) =>
        target === "/mock/bin/openclaw" ||
        target === path.resolve("/mock/bin", "..", "lib", "node_modules", "openclaw")
    );

    expect(resolveGlobalOpenClaw()).toEqual({
      bin: "/mock/bin/openclaw",
      dir: "/mock/lib/node_modules/openclaw",
    });
  });

  it("returns null when no global openclaw installation can be found", () => {
    fsMocks.existsSync.mockReturnValue(false);
    expect(resolveGlobalOpenClaw()).toBeNull();
  });
});

describe("resolveBundledGogCredentialsPath", () => {
  it("returns correct path", () => {
    expect(resolveBundledGogCredentialsPath()).toBe(
      path.join(MOCK_RESOURCES, "gog-credentials", "gog-client-secret.json")
    );
  });
});

describe("bundledBin", () => {
  it("returns resourcesPath/<tool>/<platArch>/<tool>[.exe] for each tool", () => {
    const tools = ["gog", "jq", "memo", "remindctl", "obsidian-cli", "gh"];
    for (const tool of tools) {
      expect(bundledBin(tool)).toBe(path.join(MOCK_RESOURCES, tool, platArch, `${tool}${ext}`));
    }
  });
});

describe("downloadedBin", () => {
  const mainDir = "/app/electron-desktop/dist";
  const appDir = path.resolve(mainDir, "..");

  it("returns appDir/.<tool>-runtime/<platArch>/<tool>[.exe] for each tool", () => {
    const tools = ["gog", "jq", "memo", "remindctl", "obsidian-cli", "gh"];
    for (const tool of tools) {
      expect(downloadedBin(mainDir, tool)).toBe(
        path.join(appDir, `.${tool}-runtime`, platArch, `${tool}${ext}`)
      );
    }
  });
});

describe("resolveBin", () => {
  const mainDir = "/app/electron-desktop/dist";
  const appDir = path.resolve(mainDir, "..");

  it("returns bundled path when isPackaged is true", () => {
    expect(resolveBin("gog", { isPackaged: true, mainDir })).toBe(
      path.join(MOCK_RESOURCES, "gog", platArch, `gog${ext}`)
    );
  });

  it("returns downloaded path when isPackaged is false", () => {
    expect(resolveBin("gog", { isPackaged: false, mainDir })).toBe(
      path.join(appDir, ".gog-runtime", platArch, `gog${ext}`)
    );
  });
});

describe("resolveDownloadedGogCredentialsPath", () => {
  const mainDir = "/app/electron-desktop/dist";
  const appDir = path.resolve(mainDir, "..");

  it("returns correct path", () => {
    expect(resolveDownloadedGogCredentialsPath(mainDir)).toBe(
      path.join(appDir, ".gog-runtime", "credentials", "gog-client-secret.json")
    );
  });
});

describe("resolveGogCredentialsPaths", () => {
  it("returns an array of credentials file paths", () => {
    const paths = resolveGogCredentialsPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    for (const p of paths) {
      expect(p).toContain("credentials.json");
    }
  });
});

describe("resolveRendererIndex", () => {
  it("returns packaged path when isPackaged is true", () => {
    expect(
      resolveRendererIndex({
        isPackaged: true,
        appPath: "/app",
        mainDir: "/app/dist",
      })
    ).toBe(path.join("/app", "renderer", "dist", "index.html"));
  });

  it("returns dev path when isPackaged is false", () => {
    expect(
      resolveRendererIndex({
        isPackaged: false,
        appPath: "/app",
        mainDir: "/app/electron-desktop/dist",
      })
    ).toBe(path.join("/app/electron-desktop", "renderer", "dist", "index.html"));
  });
});

describe("resolvePreloadPath", () => {
  it("returns mainDir/preload.js", () => {
    expect(resolvePreloadPath("/app/dist")).toBe(path.join("/app/dist", "preload.js"));
  });
});
