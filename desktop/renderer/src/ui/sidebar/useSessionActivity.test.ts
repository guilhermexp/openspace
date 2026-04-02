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
    runSessionKeyByRunId: Record<string, string>;
  };
};

function setMockState(state: MockState) {
  mockUseAppSelector.mockImplementation((selector: (value: MockState) => unknown) =>
    selector(state)
  );
}

describe("useSessionActivity", () => {
  beforeEach(() => {
    mockUseAppSelector.mockReset();
    setMockState({
      chat: {
        runSessionKeyByRunId: {},
      },
    });
  });

  it("returns an empty map when there are no active sessions", () => {
    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toEqual({});
  });

  it("returns a map of busy sessions keyed by sessionKey", () => {
    setMockState({
      chat: {
        runSessionKeyByRunId: {
          run_1: "session-1",
          run_2: "session-2",
          run_3: "session-1",
        },
      },
    });

    const { result } = renderHook(() => useSessionActivity());

    expect(result.current).toEqual({
      "session-1": true,
      "session-2": true,
    });
  });
});
