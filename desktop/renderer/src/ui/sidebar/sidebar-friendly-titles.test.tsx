// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { authReducer } from "@store/slices/auth/authSlice";
import { chatReducer } from "@store/slices/chat/chatSlice";
import { configReducer } from "@store/slices/configSlice";
import { gatewayReducer } from "@store/slices/gatewaySlice";
import { onboardingReducer } from "@store/slices/onboardingSlice";
import { upgradePaywallReducer } from "@store/slices/upgradePaywallSlice";

const mockRequest = vi.fn(async () => ({ sessions: [] }));
const mockSessionTitlesList = vi.fn(async () => ({
  titles: {
    "session-1": {
      title: "Corrigir onboarding",
      sourceHash: "hash-1",
      updatedAt: "2026-04-02T06:15:00.000Z",
    },
  },
}));
const mockSessionTitlesEnsure = vi.fn(async () => ({
  titles: {
    "session-1": {
      title: "Corrigir onboarding",
      sourceHash: "hash-1",
      updatedAt: "2026-04-02T06:15:00.000Z",
    },
  },
}));

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
      upgradePaywall: upgradePaywallReducer,
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

describe("Sidebar friendly titles", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockSessionTitlesList.mockClear();
    mockSessionTitlesEnsure.mockClear();
    mockRequest.mockResolvedValue({
      sessions: [
        {
          key: "session-1",
          kind: "chat",
          derivedTitle: "follow up on onboarding error and retry gateway bootstrap",
          lastMessagePreview: "check if settings screen still fails after reconnect",
          updatedAt: Date.now(),
        },
      ],
    });

    Object.defineProperty(window, "openclawDesktop", {
      configurable: true,
      value: {
        sessionTitlesList: mockSessionTitlesList,
        sessionTitlesEnsure: mockSessionTitlesEnsure,
      } as unknown as NonNullable<Window["openclawDesktop"]>,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("prefers the locally generated title and requests automatic title generation", async () => {
    renderSidebar();

    expect(
      await screen.findByRole("button", {
        name: /corrigir onboarding/i,
      })
    ).toBeTruthy();

    await waitFor(() => {
      expect(mockSessionTitlesList).toHaveBeenCalledTimes(1);
      expect(mockSessionTitlesEnsure).toHaveBeenCalledWith({
        sessions: [
          {
            sessionKey: "session-1",
            derivedTitle: "follow up on onboarding error and retry gateway bootstrap",
            lastMessagePreview: "check if settings screen still fails after reconnect",
          },
        ],
      });
    });
  });
});
