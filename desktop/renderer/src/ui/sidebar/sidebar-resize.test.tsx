// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { authReducer } from "@store/slices/auth/authSlice";
import { chatReducer } from "@store/slices/chat/chatSlice";
import { configReducer } from "@store/slices/configSlice";
import { gatewayReducer } from "@store/slices/gatewaySlice";
import { onboardingReducer } from "@store/slices/onboardingSlice";

const SIDEBAR_WIDTH_KEY = "openclaw:sidebar-width";
const mockRequest = vi.fn(async () => ({ sessions: [] }));
const storage = new Map<string, string>();
const localStorageShim = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
  clear: vi.fn(() => {
    storage.clear();
  }),
};

vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => ({
    client: {},
    connected: true,
    request: mockRequest,
    onEvent: vi.fn(() => () => {}),
  }),
}));

vi.mock("../chat/hooks/optimisticSessionContext", () => ({
  useOptimisticSession: () => ({ optimistic: null, setOptimistic: vi.fn() }),
}));

vi.mock("@shared/hooks/useTerminalSidebarVisible", () => ({
  useTerminalSidebarVisible: () => [false] as const,
}));

vi.mock("../app/hooks/useUpgradePaywall", () => ({
  useUpgradePaywall: () => ({ open: vi.fn() }),
}));

vi.mock("./useSessionActivity", () => ({
  useSessionActivity: () => ({}),
}));

function createTestStore() {
  return configureStore({
    reducer: {
      chat: chatReducer,
      config: configReducer,
      gateway: gatewayReducer,
      onboarding: onboardingReducer,
      auth: authReducer,
    },
  });
}

function renderSidebar() {
  return render(
    <Provider store={createTestStore()}>
      <MemoryRouter initialEntries={["/chat"]}>
        <Sidebar />
      </MemoryRouter>
    </Provider>
  );
}

describe("Sidebar resize", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageShim,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageShim,
      configurable: true,
    });
    localStorage.clear();
    mockRequest.mockClear();
    mockRequest.mockResolvedValue({ sessions: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("restores the persisted width and saves a new one after dragging", () => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "280");

    renderSidebar();

    const sidebar = screen.getByLabelText("Chat sessions");
    expect(sidebar.style.width).toBe("280px");

    const handle = screen.getByLabelText("Resize sidebar");
    fireEvent.mouseDown(handle, { clientX: 280 });
    fireEvent.mouseMove(window, { clientX: 320 });
    fireEvent.mouseUp(window);

    expect(sidebar.style.width).toBe("320px");
    expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBe("320");
  });

  it("clamps the resized width within the supported range", () => {
    renderSidebar();

    const sidebar = screen.getByLabelText("Chat sessions");
    const handle = screen.getByLabelText("Resize sidebar");

    fireEvent.mouseDown(handle, { clientX: 220 });
    fireEvent.mouseMove(window, { clientX: 80 });
    fireEvent.mouseUp(window);
    expect(sidebar.style.width).toBe("180px");

    fireEvent.mouseDown(handle, { clientX: 180 });
    fireEvent.mouseMove(window, { clientX: 420 });
    fireEvent.mouseUp(window);
    expect(sidebar.style.width).toBe("360px");
  });
});
