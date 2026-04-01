import { ipcMain } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { IPC, IPC_EVENTS } from "../../shared/ipc-channels";
import { resolveOpenAiApiKeyFromStateDir } from "../keys/openai-api-key";
import type { WhisperHandlerParams } from "../ipc/types";
import { downloadFile } from "./download";
import { ensureFfmpeg, resolveFfmpegPath } from "./ffmpeg";
import { writeSelectedWhisperModel } from "./model-state";
import {
  DEFAULT_MODEL_ID,
  WHISPER_MODELS,
  getModelDef,
  resolveModelPath,
  type WhisperModelId,
} from "./models";

// Re-export for consumers that previously imported from this file.
export {
  DEFAULT_MODEL_ID,
  WHISPER_MODELS,
  getModelDef,
  resolveModelPath,
  type WhisperModelDef,
  type WhisperModelId,
} from "./models";
export { resolveFfmpegPath } from "./ffmpeg";

const OPENAI_AUDIO_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const OPENAI_AUDIO_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_AUDIO_TRANSCRIPTION_TIMEOUT_MS = 60_000;

async function transcribeWithOpenAi(params: {
  audioBase64: string;
  apiKey: string;
  mime?: string;
  fileName?: string;
  language?: string;
}): Promise<{ ok: boolean; text?: string; error?: string; model?: string }> {
  try {
    const bytes = Buffer.from(params.audioBase64, "base64");
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], {
        type: params.mime?.trim() || "application/octet-stream",
      }),
      params.fileName?.trim() || "recording.webm"
    );
    form.append("model", OPENAI_AUDIO_TRANSCRIPTION_MODEL);
    if (params.language?.trim()) {
      form.append("language", params.language.trim());
    }

    const res = await fetch(OPENAI_AUDIO_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(OPENAI_AUDIO_TRANSCRIPTION_TIMEOUT_MS),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        if (text.trim()) {
          detail = `HTTP ${res.status}: ${text.trim()}`;
        }
      } catch {
        // ignore read failures
      }
      return { ok: false, error: `OpenAI transcription failed: ${detail}` };
    }

    const payload = (await res.json()) as { text?: string };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return { ok: false, error: "OpenAI transcription response missing text." };
    }

    return { ok: true, text, model: OPENAI_AUDIO_TRANSCRIPTION_MODEL };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `OpenAI transcription failed: ${message}` };
  }
}

export function registerWhisperIpcHandlers(params: WhisperHandlerParams): void {
  const { whisperCliBin, whisperDataDir } = params;

  let downloadAbort: AbortController | null = null;

  ipcMain.handle(IPC.whisperModelStatus, (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
    const model = getModelDef(modelId);
    const modelPath = resolveModelPath(whisperDataDir, model);
    const exists = fs.existsSync(modelPath);
    let size = 0;
    if (exists) {
      try {
        size = fs.statSync(modelPath).size;
      } catch {
        // ignore
      }
    }
    const binExists = fs.existsSync(whisperCliBin);
    const ffmpegPath = resolveFfmpegPath(whisperDataDir);
    const ffmpegReady = fs.existsSync(ffmpegPath);
    return {
      modelReady: exists && size > 0,
      binReady: binExists,
      ffmpegReady,
      modelPath,
      size,
      modelId: model.id,
    };
  });

  ipcMain.handle(IPC.whisperModelDownload, async (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
    const model = getModelDef(modelId);
    const modelPath = resolveModelPath(whisperDataDir, model);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });

    downloadAbort?.abort();
    const abort = new AbortController();
    downloadAbort = abort;

    try {
      await ensureFfmpeg(whisperDataDir);
    } catch (err) {
      downloadAbort = null;
      return { ok: false, error: `Failed to download ffmpeg: ${String(err)}` };
    }

    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.whisperModelDownloadProgress, {
            percent,
            transferred,
            total,
          });
        }
      };

      await downloadFile(model.url, modelPath, {
        onProgress: sendProgress,
        userAgent: "openclaw-electron-desktop/whisper-model-download",
        signal: abort.signal,
      });

      downloadAbort = null;
      return { ok: true, modelPath };
    } catch (err) {
      downloadAbort = null;
      if (abort.signal.aborted) {
        return { ok: false, error: "cancelled" };
      }
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.whisperModelDownloadCancel, () => {
    if (downloadAbort) {
      downloadAbort.abort();
      downloadAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.whisperModelsList, () => {
    const ffmpegPath = resolveFfmpegPath(whisperDataDir);
    const ffmpegReady = fs.existsSync(ffmpegPath);
    return WHISPER_MODELS.map((m) => {
      const modelPath = resolveModelPath(whisperDataDir, m);
      const exists = fs.existsSync(modelPath);
      let size = 0;
      if (exists) {
        try {
          size = fs.statSync(modelPath).size;
        } catch {
          // ignore
        }
      }
      return {
        id: m.id,
        label: m.label,
        description: m.description,
        sizeLabel: m.sizeLabel,
        downloaded: exists && size > 0,
        ffmpegReady,
        size,
      };
    });
  });

  ipcMain.handle(
    IPC.whisperTranscribe,
    async (
      _evt,
      p: { audio?: string; language?: string; model?: string; mime?: string; fileName?: string }
    ) => {
      const audioBase64 = typeof p?.audio === "string" ? p.audio : "";
      if (!audioBase64) {
        return { ok: false, error: "No audio data provided" };
      }

      if (p?.model === "openai") {
        const apiKey = resolveOpenAiApiKeyFromStateDir(params.stateDir);
        if (!apiKey) {
          return { ok: false, error: "OpenAI API key not configured." };
        }
        return transcribeWithOpenAi({
          audioBase64,
          apiKey,
          mime: p?.mime,
          fileName: p?.fileName,
          language: p?.language,
        });
      }

      if (!fs.existsSync(whisperCliBin)) {
        return { ok: false, error: `whisper-cli binary not found at: ${whisperCliBin}` };
      }

      const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
      const model = getModelDef(modelId);
      const modelPath = resolveModelPath(whisperDataDir, model);
      if (!fs.existsSync(modelPath)) {
        return {
          ok: false,
          error: "Whisper model not downloaded. Please download it in Settings → Voice.",
        };
      }

      const tmpDir = path.join(os.tmpdir(), "openclaw-whisper");
      fs.mkdirSync(tmpDir, { recursive: true });
      const timestamp = Date.now();
      const wavPath = path.join(tmpDir, `voice-${timestamp}.wav`);
      const outputBase = path.join(tmpDir, `voice-${timestamp}`);
      const outputTxtPath = `${outputBase}.txt`;

      try {
        const buffer = Buffer.from(audioBase64, "base64");
        fs.writeFileSync(wavPath, buffer);

        const args = ["-m", modelPath, "-otxt", "-of", outputBase, "-np", "-nt"];

        const language =
          typeof p?.language === "string" && p.language.trim() ? p.language.trim() : "auto";
        args.push("-l", language);

        args.push(wavPath);

        console.log("[whisper] spawn:", whisperCliBin, args.join(" "));
        const startMs = Date.now();

        const {
          text,
          stdout: cliStdout,
          stderr: cliStderr,
        } = await new Promise<{
          text: string;
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          const child = spawn(whisperCliBin, args, {
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 120_000,
          });

          let stdoutBuf = "";
          let stderrBuf = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            stdoutBuf += chunk.toString("utf-8");
          });
          child.stderr?.on("data", (chunk: Buffer) => {
            stderrBuf += chunk.toString("utf-8");
          });

          child.on("close", (code) => {
            if (code !== 0) {
              reject(new Error(`whisper-cli exited with code ${code}: ${stderrBuf.trim()}`));
              return;
            }

            try {
              const raw = fs.readFileSync(outputTxtPath, "utf-8").trim();
              const txt = /^\[BLANK_AUDIO\]$/i.test(raw) ? "" : raw;
              resolve({ text: txt, stdout: stdoutBuf, stderr: stderrBuf });
            } catch (readErr) {
              reject(new Error(`Failed to read whisper output: ${String(readErr)}`));
            }
          });

          child.on("error", (err) => {
            reject(new Error(`Failed to spawn whisper-cli: ${String(err)}`));
          });
        });

        const elapsedMs = Date.now() - startMs;
        console.log(`[whisper] done in ${elapsedMs}ms, text length=${text.length}`);
        if (cliStderr) console.log("[whisper] stderr:", cliStderr.trim());
        if (cliStdout) console.log("[whisper] stdout:", cliStdout.trim());

        return { ok: true, text, stderr: cliStderr.trim(), elapsed: elapsedMs };
      } catch (err) {
        return { ok: false, error: String(err) };
      } finally {
        try {
          fs.rmSync(wavPath, { force: true });
        } catch {
          /* ignore */
        }
        try {
          fs.rmSync(outputTxtPath, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  );

  ipcMain.handle(IPC.whisperSetGatewayModel, async (_event, modelId: string) => {
    try {
      writeSelectedWhisperModel(params.stateDir, modelId);
      await params.stopGatewayChild();
      await params.startGateway({ silent: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
