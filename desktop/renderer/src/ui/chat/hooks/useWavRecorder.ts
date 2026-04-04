import { useCallback, useRef, useState } from "react";
import { errorToMessage } from "@shared/toast";

const SAMPLE_RATE = 16_000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const WORKLET_PROCESSOR_NAME = "wav-recorder-processor";
const WORKLET_MODULE_PATH = "wav-recorder.worklet.js";

function encodeWav(samples: Float32Array): Uint8Array {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataLength = samples.length * bytesPerSample;
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * bytesPerSample, true);
  view.setUint16(32, NUM_CHANNELS * bytesPerSample, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Convert float32 samples to int16
  let offset = headerLength;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export type WavRecorderResult = {
  startRecording: () => void;
  stopRecording: () => Promise<Uint8Array | null>;
  cancelRecording: () => void;
  isRecording: boolean;
  error: string | null;
};

export function useWavRecorder(): WavRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    if (processorRef.current) {
      processorRef.current.port.onmessage = null;
    }
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close().catch(() => {});
    processorRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    chunksRef.current = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(async (stream) => {
        let ctx: AudioContext | null = null;
        try {
          ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
          const source = ctx.createMediaStreamSource(stream);
          await ctx.audioWorklet.addModule(resolveWorkletModuleUrl());
          const processor = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            channelCount: 1,
          });

          processor.port.onmessage = (event: MessageEvent<unknown>) => {
            const samples = extractSamples(event.data);
            if (samples && samples.length > 0) {
              chunksRef.current.push(samples);
            }
          };

          source.connect(processor);

          audioContextRef.current = ctx;
          mediaStreamRef.current = stream;
          sourceRef.current = source;
          processorRef.current = processor;
          setIsRecording(true);
        } catch (err) {
          processorRef.current?.disconnect();
          sourceRef.current?.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          await ctx?.close().catch(() => {});
          audioContextRef.current = null;
          mediaStreamRef.current = null;
          sourceRef.current = null;
          processorRef.current = null;
          setError(`Microphone setup failed: ${errorToMessage(err)}`);
        }
      })
      .catch((err) => {
        setError(`Microphone access denied: ${errorToMessage(err)}`);
      });
  }, []);

  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    if (!audioContextRef.current) {
      setIsRecording(false);
      return null;
    }

    processorRef.current?.disconnect();
    if (processorRef.current) {
      processorRef.current.port.onmessage = null;
    }
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    const chunks = chunksRef.current;
    chunksRef.current = [];

    await audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    setIsRecording(false);

    if (chunks.length === 0) {
      return null;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWav(merged);
  }, []);

  const cancelRecording = useCallback(() => {
    cleanup();
    setIsRecording(false);
  }, [cleanup]);

  return { startRecording, stopRecording, cancelRecording, isRecording, error };
}

function extractSamples(data: unknown): Float32Array | null {
  if (data instanceof Float32Array) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  const maybeSamples = (data as { samples?: unknown }).samples;
  if (maybeSamples instanceof Float32Array) {
    return maybeSamples;
  }
  if (Array.isArray(maybeSamples)) {
    return new Float32Array(maybeSamples);
  }
  return null;
}

function resolveWorkletModuleUrl(): string {
  if (typeof window !== "undefined" && window.location?.href) {
    return new URL(WORKLET_MODULE_PATH, window.location.href).toString();
  }
  return WORKLET_MODULE_PATH;
}
