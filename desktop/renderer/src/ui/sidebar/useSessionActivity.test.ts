// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionActivity } from "./useSessionActivity";

const mockUseAppSelector = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppSelector: (selector: (state: Record<string, unknown>) => unknown) =>
    mockUseAppSelector(selector),
}));

type MockState = {
  chat: {
    sending: boolean;
    liveToolCalls: Record<string, unknown>;
    streamByRun: Record<string, unknown>;
  };
};

function setMockState(state: MockState) {
  mockUseAppSelector.mockImplementation((selector: (value: MockState) => unknown) => selector(state));
}

describe("useSessionActivity", () => {
  beforeEach(() => {
    mockUseAppSelector.mockReset();
    setMockState({
      chat: {
        sending: false,
        liveToolCalls: {},
        streamByRun: {},
      },
    });
  });

  it("returns false when the current session has no activity", () => {
    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toBe(false);
  });

  it("returns true while sending", () => {
    setMockState({
      chat: {
        sending: true,
        liveToolCalls: {},
        streamByRun: {},
      },
    });

    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toBe(true);
  });

  it("returns true when there are live tool calls", () => {
    setMockState({
      chat: {
        sending: false,
        liveToolCalls: { tool_1: { toolCallId: "tool_1" } },
        streamByRun: {},
      },
    });

    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toBe(true);
  });

  it("returns true when there is assistant stream in progress", () => {
    setMockState({
      chat: {
        sending: false,
        liveToolCalls: {},
        streamByRun: { run_1: { id: "s-run_1", text: "streaming" } },
      },
    });

    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toBe(true);
  });
});
