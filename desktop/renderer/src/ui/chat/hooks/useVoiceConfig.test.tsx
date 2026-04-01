// @vitest-environment jsdom
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockUseVoiceInput = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: { whisper: { download: { kind: string } } }) => unknown) =>
    selector({ whisper: { download: { kind: "idle" } } }),
}));

vi.mock("@store/slices/whisperSlice", () => ({
  downloadWhisperModel: (model: string) => ({ type: "whisper/download", payload: model }),
}));

vi.mock("./useVoiceInput", async () => {
  const actual = await vi.importActual<typeof import("./useVoiceInput")>("./useVoiceInput");
  return {
    ...actual,
    getVoiceProvider: () => "openai" as const,
    useVoiceInput: (...args: unknown[]) => mockUseVoiceInput(...args),
  };
});

import { useVoiceConfig } from "./useVoiceConfig";

describe("useVoiceConfig", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockDispatch.mockReset();
    mockUseVoiceInput.mockReset();
  });

  it("calls onTranscript when a voice message is transcribed", async () => {
    const onTranscript = vi.fn();
    const stopRecording = vi.fn().mockResolvedValue("fala comigo");

    mockUseVoiceInput.mockReturnValue({
      startRecording: vi.fn(),
      stopRecording,
      cancelRecording: vi.fn(),
      isRecording: false,
      error: null,
      isProcessing: false,
    });

    const composerRef = { current: { focusInput: vi.fn() } };
    const gwRequest = vi.fn().mockResolvedValue({ config: {} });
    const setInput = vi.fn();

    const { result } = renderHook(() =>
      useVoiceConfig(gwRequest, composerRef as React.RefObject<{ focusInput: () => void }>, setInput, {
        onTranscript,
      })
    );

    await act(async () => {
      await result.current.handleVoiceStop();
    });

    expect(stopRecording).toHaveBeenCalled();
    expect(onTranscript).toHaveBeenCalledWith("fala comigo");
    expect(setInput).not.toHaveBeenCalled();
  });
});
