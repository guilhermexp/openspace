import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain, BrowserWindow } from "electron";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ size: 0 })),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  rmSync: vi.fn(),
  createWriteStream: vi.fn(),
  renameSync: vi.fn(),
  default: {
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({ size: 0 })),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ""),
    rmSync: vi.fn(),
    createWriteStream: vi.fn(),
    renameSync: vi.fn(),
  },
}));

import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { registerWhisperIpcHandlers, WHISPER_MODELS } from "./ipc";

function getHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  const calls = vi.mocked(ipcMain.handle).mock.calls;
  const match = calls.find((c) => c[0] === channel);
  return match ? (match[1] as (...args: unknown[]) => unknown) : undefined;
}

describe("whisper IPC handlers", () => {
  const whisperCliBin = "/mock/bin/whisper-cli";
  const whisperDataDir = "/mock/data/whisper";
  const stateDir = "/mock/state";
  let mockWindow: InstanceType<typeof BrowserWindow>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
    vi.mocked(fs.existsSync).mockReset().mockReturnValue(false);
    vi.mocked(fs.statSync)
      .mockReset()
      .mockReturnValue({ size: 0 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReset().mockReturnValue("");
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    vi.mocked(fs.rmSync).mockReset();
    vi.mocked(spawn).mockReset();
    globalThis.fetch = vi.fn();

    mockWindow = new BrowserWindow();

    registerWhisperIpcHandlers({
      whisperCliBin,
      whisperDataDir,
      getMainWindow: () => mockWindow,
      stateDir,
      stopGatewayChild: vi.fn(async () => {}),
      startGateway: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers four IPC channels", () => {
    const channels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0]);
    expect(channels).toContain("whisper-model-status");
    expect(channels).toContain("whisper-model-download");
    expect(channels).toContain("whisper-models-list");
    expect(channels).toContain("whisper-transcribe");
  });

  // --- whisper-model-status ---

  describe("whisper-model-status", () => {
    it("returns modelReady=false when model file does not exist", () => {
      const handler = getHandler("whisper-model-status")!;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handler({}) as Record<string, unknown>;
      expect(result.modelReady).toBe(false);
      expect(result.binReady).toBe(false);
    });

    it("returns modelReady=true when model exists with non-zero size", () => {
      const handler = getHandler("whisper-model-status")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 145_000_000 } as fs.Stats);

      const result = handler({}) as Record<string, unknown>;
      expect(result.modelReady).toBe(true);
      expect(result.binReady).toBe(true);
      expect(result.ffmpegReady).toBe(true);
      expect(result.size).toBe(145_000_000);
    });

    it("defaults to small model", () => {
      const handler = getHandler("whisper-model-status")!;
      const result = handler({}) as Record<string, unknown>;
      expect(result.modelId).toBe("small");
      expect(String(result.modelPath)).toContain("ggml-small.bin");
    });

    it("accepts model parameter", () => {
      const handler = getHandler("whisper-model-status")!;
      const result = handler({}, { model: "large-v3-turbo" }) as Record<string, unknown>;
      expect(result.modelId).toBe("large-v3-turbo");
      expect(String(result.modelPath)).toContain("ggml-large-v3-turbo.bin");
    });
  });

  // --- whisper-models-list ---

  describe("whisper-models-list", () => {
    it("returns all available models with download status", () => {
      const handler = getHandler("whisper-models-list")!;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handler() as Array<Record<string, unknown>>;
      expect(result).toHaveLength(WHISPER_MODELS.length);
      expect(result.map((m) => m.id)).toEqual(["small", "large-v3-turbo-q8", "large-v3-turbo"]);
      expect(result[0]!.downloaded).toBe(false);
    });

    it("marks downloaded models correctly", () => {
      const handler = getHandler("whisper-models-list")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500_000_000 } as fs.Stats);

      const result = handler() as Array<Record<string, unknown>>;
      expect(result.every((m) => m.downloaded === true)).toBe(true);
    });
  });

  // --- whisper-transcribe ---

  describe("whisper-transcribe", () => {
    it("returns error when no audio data is provided", async () => {
      const handler = getHandler("whisper-transcribe")!;
      const result = await handler({}, {});
      expect(result).toEqual({ ok: false, error: "No audio data provided" });
    });

    it("returns error when audio is an empty string", async () => {
      const handler = getHandler("whisper-transcribe")!;
      const result = await handler({}, { audio: "" });
      expect(result).toEqual({ ok: false, error: "No audio data provided" });
    });

    it("returns error when whisper-cli binary does not exist", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await handler({}, { audio: "AAAA" });
      expect(result).toEqual({
        ok: false,
        error: `whisper-cli binary not found at: ${whisperCliBin}`,
      });
    });

    it("returns error when model is not downloaded", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockImplementation(
        ((p: string) => String(p) === whisperCliBin) as typeof fs.existsSync
      );

      const result = (await handler({}, { audio: "AAAA" })) as Record<string, unknown>;
      expect(result.ok).toBe(false);
      expect(String(result.error)).toContain("Whisper model not downloaded");
    });

    it("returns error when OpenAI provider is selected without a saved API key", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockImplementation(
        ((p: string) => String(p) !== whisperCliBin) as typeof fs.existsSync
      );
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
        if (String(filePath).endsWith("auth-profiles.json")) {
          return JSON.stringify({ version: 1, profiles: {}, order: {} });
        }
        return "";
      }) as typeof fs.readFileSync);

      const result = (await handler({}, { audio: "AAAA", model: "openai" })) as Record<
        string,
        unknown
      >;
      expect(result).toEqual({
        ok: false,
        error: "OpenAI API key not configured.",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("uses the saved OpenAI API key for remote transcription when model=openai", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockImplementation(((p: string) =>
        String(p).endsWith("auth-profiles.json")) as typeof fs.existsSync);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
        if (String(filePath).endsWith("auth-profiles.json")) {
          return JSON.stringify({
            version: 1,
            profiles: {
              "openai:default": {
                type: "api_key",
                provider: "openai",
                key: "sk-test",
              },
            },
            order: {
              openai: ["openai:default"],
            },
          });
        }
        return "";
      }) as typeof fs.readFileSync);
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ text: "hello from openai" }), { status: 200 })
      );

      const result = (await handler(
        {},
        {
          audio: Buffer.from("audio").toString("base64"),
          model: "openai",
          mime: "audio/webm",
          fileName: "recording.webm",
        }
      )) as Record<string, unknown>;

      expect(result).toMatchObject({
        ok: true,
        text: "hello from openai",
        model: "gpt-4o-mini-transcribe",
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test",
          }),
        })
      );
      expect(spawn).not.toHaveBeenCalled();
    });

    it("spawns whisper-cli and returns transcribed text on success", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("Hello world");

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA" });

      const closeHandler = mockChild.on.mock.calls.find((c) => c[0] === "close")?.[1] as (
        code: number
      ) => void;
      closeHandler(0);

      const result = await resultPromise;
      expect(result).toMatchObject({ ok: true, text: "Hello world" });
      expect((result as Record<string, unknown>).elapsed).toBeTypeOf("number");

      expect(spawn).toHaveBeenCalledWith(
        whisperCliBin,
        expect.arrayContaining([
          "-m",
          expect.stringContaining("ggml-small.bin"),
          "-otxt",
          "-l",
          "auto",
        ]),
        expect.objectContaining({ timeout: 120_000 })
      );
    });

    it("uses specified model when model parameter is provided", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("test");

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA", model: "large-v3-turbo" });

      const closeHandler = mockChild.on.mock.calls.find((c) => c[0] === "close")?.[1] as (
        code: number
      ) => void;
      closeHandler(0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        whisperCliBin,
        expect.arrayContaining(["-m", expect.stringContaining("ggml-large-v3-turbo.bin")]),
        expect.anything()
      );
    });

    it("includes language flag when language is provided", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("Привет мир");

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA", language: "ru" });

      const closeHandler = mockChild.on.mock.calls.find((c) => c[0] === "close")?.[1] as (
        code: number
      ) => void;
      closeHandler(0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        whisperCliBin,
        expect.arrayContaining(["-l", "ru"]),
        expect.anything()
      );
    });

    it("returns error when whisper-cli exits with non-zero code", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA" });

      const stderrHandler = mockChild.stderr.on.mock.calls.find((c) => c[0] === "data")?.[1] as (
        data: Buffer
      ) => void;
      stderrHandler(Buffer.from("some error output"));

      const closeHandler = mockChild.on.mock.calls.find((c) => c[0] === "close")?.[1] as (
        code: number
      ) => void;
      closeHandler(1);

      const result = (await resultPromise) as { ok: boolean; error: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain("whisper-cli exited with code 1");
      expect(result.error).toContain("some error output");
    });

    it("returns error when whisper-cli fails to spawn", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA" });

      const errorHandler = mockChild.on.mock.calls.find((c) => c[0] === "error")?.[1] as (
        err: Error
      ) => void;
      errorHandler(new Error("ENOENT"));

      const result = (await resultPromise) as { ok: boolean; error: string };
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Failed to spawn whisper-cli");
    });

    it("cleans up temp files after transcription", async () => {
      const handler = getHandler("whisper-transcribe")!;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("test");

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as never);

      const resultPromise = handler({}, { audio: "AAAA" });

      const closeHandler = mockChild.on.mock.calls.find((c) => c[0] === "close")?.[1] as (
        code: number
      ) => void;
      closeHandler(0);

      await resultPromise;

      // rmSync called at least twice (wav + txt cleanup)
      expect(vi.mocked(fs.rmSync).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
