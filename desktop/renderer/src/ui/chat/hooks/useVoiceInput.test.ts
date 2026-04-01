// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVoiceInput, getVoiceProvider, setVoiceProvider } from "./useVoiceInput";

// Mock useWavRecorder
const mockWavRecorder = {
  startRecording: vi.fn(),
  stopRecording: vi.fn(() => Promise.resolve(null as Uint8Array | null)),
  cancelRecording: vi.fn(),
  isRecording: false,
  error: null as string | null,
};

vi.mock("./useWavRecorder", () => ({
  useWavRecorder: () => ({ ...mockWavRecorder }),
}));

// Mock desktopApi
const mockDesktopApi = {
  whisperTranscribe: vi.fn(),
  whisperModelStatus: vi.fn(),
  whisperModelDownload: vi.fn(),
  onWhisperModelDownloadProgress: vi.fn(() => () => {}),
};

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockDesktopApi,
  getDesktopApi: () => mockDesktopApi,
  isDesktopApiAvailable: () => true,
}));

const STORAGE_KEY = "openclaw:voiceProvider";
const localStorageState = new Map<string, string>();
const localStorageShim = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageState.clear();
  }),
};

beforeEach(() => {
  // @ts-expect-error test shim
  globalThis.localStorage = localStorageShim;
  localStorageShim.clear();
});

describe("getVoiceProvider / setVoiceProvider", () => {
  beforeEach(() => localStorage.clear());

  it("returns 'openai' by default", () => {
    expect(getVoiceProvider()).toBe("openai");
  });

  it("returns stored provider", () => {
    localStorage.setItem(STORAGE_KEY, "local");
    expect(getVoiceProvider()).toBe("local");
  });

  it("returns 'openai' for invalid stored values", () => {
    localStorage.setItem(STORAGE_KEY, "invalid");
    expect(getVoiceProvider()).toBe("openai");
  });

  it("setVoiceProvider stores the value", () => {
    setVoiceProvider("local");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("local");
  });
});

describe("useVoiceInput", () => {
  const mockGwRequest = vi.fn();
  const mockTrackStop = vi.fn();

  async function flushMedia() {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }

  beforeEach(() => {
    localStorage.clear();
    mockGwRequest.mockReset();
    mockWavRecorder.startRecording.mockReset();
    mockWavRecorder.stopRecording.mockReset().mockResolvedValue(null);
    mockWavRecorder.cancelRecording.mockReset();
    mockWavRecorder.isRecording = false;
    mockWavRecorder.error = null;
    mockDesktopApi.whisperTranscribe.mockReset();
    mockTrackStop.mockReset();
  });

  afterEach(() => localStorage.clear());

  it("starts with isRecording=false, no error, isProcessing=false", () => {
    const { result } = renderHook(() => useVoiceInput(mockGwRequest));
    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  // --- LOCAL provider ---

  describe("local provider", () => {
    beforeEach(() => {
      setVoiceProvider("local");
    });

    it("startRecording calls wavRecorder.startRecording", () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      expect(mockWavRecorder.startRecording).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(true);
    });

    it("stopRecording calls whisperTranscribe with base64 WAV", async () => {
      const wavData = new Uint8Array([1, 2, 3, 4]);
      mockWavRecorder.stopRecording.mockResolvedValue(wavData);
      mockDesktopApi.whisperTranscribe.mockResolvedValue({ ok: true, text: "Hello" });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      let text: string | null = null;
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBe("Hello");
      expect(mockDesktopApi.whisperTranscribe).toHaveBeenCalledWith({
        audio: expect.any(String),
        model: expect.any(String),
      });
      expect(result.current.isProcessing).toBe(false);
    });

    it("stopRecording returns null when wavRecorder returns null", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(null);

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      let text: string | null = "not-null";
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBeNull();
      expect(mockDesktopApi.whisperTranscribe).not.toHaveBeenCalled();
    });

    it("stopRecording returns null when wavRecorder returns empty array", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array(0));

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      let text: string | null = "not-null";
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBeNull();
    });

    it("sets error when whisperTranscribe returns ok=false", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1, 2, 3]));
      mockDesktopApi.whisperTranscribe.mockResolvedValue({
        ok: false,
        error: "Model not found",
      });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(result.current.error).toContain("Model not found");
    });

    it("sets error when whisperTranscribe throws", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1, 2, 3]));
      mockDesktopApi.whisperTranscribe.mockRejectedValue(new Error("IPC broken"));

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(result.current.error).toContain("IPC broken");
    });

    it("cancelRecording calls wavRecorder.cancelRecording", () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      act(() => {
        result.current.cancelRecording();
      });

      expect(mockWavRecorder.cancelRecording).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(false);
      expect(result.current.isProcessing).toBe(false);
    });

    it("does not use gwRequest for local provider", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1]));
      mockDesktopApi.whisperTranscribe.mockResolvedValue({ ok: true, text: "test" });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(mockGwRequest).not.toHaveBeenCalled();
    });
  });

  // --- OPENAI provider ---

  describe("openai provider", () => {
    beforeEach(() => {
      setVoiceProvider("openai");
    });

    it("records WAV and sends it to desktop OpenAI transcription", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
      mockDesktopApi.whisperTranscribe.mockResolvedValue({ ok: true, text: "from-openai-wav" });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      expect(mockWavRecorder.startRecording).toHaveBeenCalled();

      let text: string | null = null;
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBe("from-openai-wav");
      expect(mockDesktopApi.whisperTranscribe).toHaveBeenCalledWith({
        audio: expect.any(String),
        mime: "audio/wav",
        fileName: "recording.wav",
        model: "openai",
      });
      expect(mockGwRequest).not.toHaveBeenCalled();
    });

    it("does not cancel recording immediately after starting", () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      expect(mockWavRecorder.startRecording).toHaveBeenCalledTimes(1);
      expect(mockWavRecorder.cancelRecording).not.toHaveBeenCalled();
      expect(result.current.isRecording).toBe(true);
    });

    it("transcribes through desktop whisper IPC instead of gateway audio.transcribe", async () => {
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
      mockDesktopApi.whisperTranscribe.mockResolvedValue({ ok: true, text: "from-openai-ipc" });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });

      let text: string | null = null;
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBe("from-openai-ipc");
      expect(mockDesktopApi.whisperTranscribe).toHaveBeenCalledWith({
        audio: expect.any(String),
        mime: "audio/wav",
        fileName: "recording.wav",
        model: "openai",
      });
      expect(mockGwRequest).not.toHaveBeenCalled();
    });

    it("stopRecording returns null when no recorder is active", async () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      let text: string | null = "not-null";
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBeNull();
    });

    it("cancelRecording resets state for openai provider", () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.cancelRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isProcessing).toBe(false);
    });

    it("calls wavRecorder cancel for openai provider cancel", () => {
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));

      act(() => {
        result.current.startRecording();
      });
      act(() => {
        result.current.cancelRecording();
      });

      expect(mockWavRecorder.cancelRecording).toHaveBeenCalled();
    });
  });

  // --- Provider switching ---

  describe("provider switching", () => {
    it("uses local flow after switching provider", async () => {
      setVoiceProvider("local");
      mockWavRecorder.stopRecording.mockResolvedValue(new Uint8Array([1]));
      mockDesktopApi.whisperTranscribe.mockResolvedValue({ ok: true, text: "local-text" });

      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      act(() => {
        result.current.startRecording();
      });

      let text: string | null = null;
      await act(async () => {
        text = await result.current.stopRecording();
      });

      expect(text).toBe("local-text");
      expect(mockGwRequest).not.toHaveBeenCalled();
    });
  });

  // --- Combined state ---

  describe("combined state", () => {
    it("combines isRecording from wavRecorder", () => {
      mockWavRecorder.isRecording = true;
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      expect(result.current.isRecording).toBe(true);
    });

    it("combines error from wavRecorder when no local error", () => {
      mockWavRecorder.error = "mic error from wav recorder";
      const { result } = renderHook(() => useVoiceInput(mockGwRequest));
      expect(result.current.error).toBe("mic error from wav recorder");
    });
  });
});
