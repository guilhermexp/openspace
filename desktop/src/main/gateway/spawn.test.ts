import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  createWriteStream: vi.fn(() => new PassThrough()),
}));

const helperMocks = vi.hoisted(() => ({
  ensureDir: vi.fn(),
  gatewaySpawnOptions: vi.fn(() => ({ extraArgs: [], detached: false })),
  getGogKeyringEnv: vi.fn(() => ({})),
  resolveFfmpegPath: vi.fn(() => "/mock/ffmpeg"),
  readSelectedWhisperModel: vi.fn(() => "openai"),
  getModelDef: vi.fn(),
  resolveModelPath: vi.fn(),
  resolveOpenAiApiKeyFromStateDir: vi.fn(() => "sk-desktop-openai"),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
}));

vi.mock("node:fs", () => ({
  createWriteStream: fsMocks.createWriteStream,
}));

vi.mock("../util/fs", () => ({
  ensureDir: helperMocks.ensureDir,
}));

vi.mock("../platform", () => ({
  getPlatform: () => ({
    gatewaySpawnOptions: helperMocks.gatewaySpawnOptions,
  }),
}));

vi.mock("../gog/gog-keyring", () => ({
  getGogKeyringEnv: helperMocks.getGogKeyringEnv,
}));

vi.mock("../keys/openai-api-key", () => ({
  OPENCLAW_DESKTOP_OPENAI_TTS_API_KEY_ENV: "OPENCLAW_DESKTOP_OPENAI_TTS_API_KEY",
  resolveOpenAiApiKeyFromStateDir: helperMocks.resolveOpenAiApiKeyFromStateDir,
}));

vi.mock("../whisper/ffmpeg", () => ({
  resolveFfmpegPath: helperMocks.resolveFfmpegPath,
}));

vi.mock("../whisper/model-state", () => ({
  readSelectedWhisperModel: helperMocks.readSelectedWhisperModel,
}));

vi.mock("../whisper/models", () => ({
  getModelDef: helperMocks.getModelDef,
  resolveModelPath: helperMocks.resolveModelPath,
}));

import { spawnGateway } from "./spawn";

describe("spawnGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    childProcessMocks.spawn.mockReturnValue({
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
  });

  it("injects the desktop OpenAI TTS env var when a saved API key exists", () => {
    spawnGateway({
      port: 1515,
      logsDir: "/mock/logs",
      stateDir: "/mock/state",
      configPath: "/mock/state/openclaw.json",
      token: "gateway-token",
      openclawBin: "/mock/bin/openclaw",
      stderrTail: { push: vi.fn(), read: vi.fn(() => "") },
    });

    expect(helperMocks.resolveOpenAiApiKeyFromStateDir).toHaveBeenCalledWith("/mock/state");
    expect(childProcessMocks.spawn).toHaveBeenCalledWith(
      "/mock/bin/openclaw",
      expect.arrayContaining(["gateway", "--bind", "loopback", "--port", "1515"]),
      expect.objectContaining({ cwd: "/mock/state" })
    );
    const spawnEnv = childProcessMocks.spawn.mock.calls[0]?.[2]?.env as Record<string, string>;
    expect(spawnEnv.OPENCLAW_DESKTOP_OPENAI_TTS_API_KEY).toBe("sk-desktop-openai");
  });
});
