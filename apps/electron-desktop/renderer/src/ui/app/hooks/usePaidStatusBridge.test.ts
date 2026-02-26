// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authActions } from "@store/slices/authSlice";
import { usePaidStatusBridge } from "./usePaidStatusBridge";

const dispatchMock = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => dispatchMock,
}));

describe("usePaidStatusBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("dispatches appFocused on window focus", () => {
    renderHook(() => usePaidStatusBridge());

    window.dispatchEvent(new Event("focus"));

    expect(dispatchMock).toHaveBeenCalledWith(authActions.appFocused());
  });

  it("dispatches appVisible only when document is visible", () => {
    renderHook(() => usePaidStatusBridge());

    const callsBefore = dispatchMock.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const callsAfterHidden = dispatchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(callsAfterHidden).toBe(callsBefore);
    expect(dispatchMock.mock.calls.length).toBeGreaterThan(callsAfterHidden);
    expect(dispatchMock).toHaveBeenCalledWith(authActions.appVisible());
  });

  it("removes listeners on unmount", () => {
    const { unmount } = renderHook(() => usePaidStatusBridge());
    const callsBeforeUnmount = dispatchMock.mock.calls.length;
    unmount();

    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(dispatchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
