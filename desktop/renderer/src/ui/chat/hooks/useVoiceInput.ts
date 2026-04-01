import { useCallback, useEffect, useRef, useState } from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";
import { uint8ToBase64 } from "@shared/utils/base64";
import { useWavRecorder } from "./useWavRecorder";

export type VoiceProvider = "openai" | "local";

const STORAGE_KEY = "openclaw:voiceProvider";
const MODEL_STORAGE_KEY = "openclaw:whisperModel";

export function getWhisperModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? "small";
  } catch {
    return "small";
  }
}

export function getVoiceProvider(): VoiceProvider {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "openai" || v === "local") return v;
  } catch {
    // localStorage unavailable
  }
  return "openai";
}

export function setVoiceProvider(provider: VoiceProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // localStorage unavailable
  }
}

type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export type UseVoiceInputResult = {
  startRecording: () => void;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  isRecording: boolean;
  error: string | null;
  isProcessing: boolean;
};

export function useVoiceInput(_gwRequest: GatewayRequest): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const providerRef = useRef<VoiceProvider>("openai");

  const wavRecorder = useWavRecorder();

  useEffect(() => {
    return () => {
      wavRecorder.cancelRecording();
    };
  }, [wavRecorder]);

  const startRecording = useCallback(() => {
    setError(null);
    const provider = getVoiceProvider();
    providerRef.current = provider;
    wavRecorder.startRecording();
    setIsRecording(true);
  }, [wavRecorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    setIsRecording(false);
    setIsProcessing(true);

    try {
      const wavData = await wavRecorder.stopRecording();
      if (!wavData || wavData.length === 0) {
        return null;
      }

      const api = getDesktopApiOrNull();
      if (!api?.whisperTranscribe) {
        setError(
          providerRef.current === "openai"
            ? "Desktop API not available for OpenAI transcription."
            : "Desktop API not available for local transcription."
        );
        return null;
      }

      const base64 = uint8ToBase64(wavData);
      const result =
        providerRef.current === "openai"
          ? await api.whisperTranscribe({
              audio: base64,
              mime: "audio/wav",
              fileName: "recording.wav",
              model: "openai",
            })
          : await api.whisperTranscribe({
              audio: base64,
              model: getWhisperModel(),
            });
      if (!result.ok) {
        setError(`Transcription failed: ${result.error ?? "unknown error"}`);
        return null;
      }
      return result.text?.trim() || null;
    } catch (err) {
      setError(`Transcription failed: ${errorToMessage(err)}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [wavRecorder]);

  const cancelRecording = useCallback(() => {
    wavRecorder.cancelRecording();
    setIsRecording(false);
    setIsProcessing(false);
  }, [wavRecorder]);

  const combinedIsRecording = isRecording || wavRecorder.isRecording;
  const combinedError = error ?? wavRecorder.error;

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: combinedIsRecording,
    error: combinedError,
    isProcessing,
  };
}
