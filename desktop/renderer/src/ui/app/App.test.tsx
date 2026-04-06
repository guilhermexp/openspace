// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDispatch = vi.fn(() => Promise.resolve(undefined));

const mockStoreState = {
  gateway: {
    state: {
      kind: "ready" as const,
      port: 18789,
      logsDir: "/tmp/logs",
      url: "http://localhost:18789",
      token: "test-token",
    },
  },
  onboarding: {
    onboarded: true,
  },
};

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

vi.mock("@store/slices/auth/authSlice", () => ({
  restoreMode: () => ({ type: "auth/restoreMode" }),
}));

vi.mock("@store/slices/gatewaySlice", () => ({
  initGatewayState: () => ({ type: "gateway/initGatewayState" }),
}));

vi.mock("@store/slices/onboardingSlice", () => ({
  loadOnboardingFromStorage: () => ({ type: "onboarding/loadOnboardingFromStorage" }),
}));

vi.mock("@gateway/context", () => ({
  GatewayRpcProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../chat/ChatPage", () => ({
  ChatPage: () => <div>Chat Page</div>,
}));

vi.mock("../chat/StartChatPage", () => ({
  StartChatPage: () => <div>Start Chat Page</div>,
}));

vi.mock("../sidebar/Sidebar", () => ({
  Sidebar: () => <div>Sidebar</div>,
}));

vi.mock("../settings/SettingsPage", () => ({
  SettingsPage: () => <div>Settings Page</div>,
  SettingsIndexRedirect: () => <div>Settings Redirect</div>,
  SettingsTab: () => <div>Settings Tab</div>,
}));

vi.mock("../terminal/TerminalPage", () => ({
  TerminalPage: () => <div>Terminal Page</div>,
}));

vi.mock("../onboarding/WelcomePage", () => ({
  WelcomePage: () => <div>Welcome Page</div>,
}));

vi.mock("../onboarding/ConsentScreen", () => ({
  ConsentScreen: () => <div>Consent Screen</div>,
}));

vi.mock("../onboarding/LoadingScreen", () => ({
  LoadingScreen: () => <div>Loading Screen</div>,
}));

vi.mock("@shared/kit", () => ({
  Brand: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("@shared/kit/Brand", () => ({
  useAppIconUrl: () => null,
}));

vi.mock("../chat/hooks/optimisticSessionContext", () => ({
  OptimisticSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OptimisticSessionSync: () => null,
}));

vi.mock("./ExecApprovalModal", () => ({
  ExecApprovalOverlay: () => <div>Exec Approval Overlay</div>,
}));

vi.mock("./UpgradePaywallPopup", () => ({
  UpgradePaywallPopup: () => null,
}));

vi.mock("./hooks/usePaidStatusBridge", () => ({
  usePaidStatusBridge: () => undefined,
}));

vi.mock("../shared/banners/SubscriptionPromoBannerSource", () => ({
  SubscriptionPromoBannerSource: () => null,
}));

vi.mock("../updates/UpdateBanner", () => ({
  UpdateBanner: () => <div>Update Banner</div>,
}));

vi.mock("../updates/DefenderBanner", () => ({
  DefenderBanner: () => null,
}));

vi.mock("../shared/banners/AppBanners", () => ({
  AppBanners: () => null,
}));

vi.mock("@ui/skills/SkillsPage", () => ({
  SkillsPage: () => <div>Skills Page</div>,
}));

vi.mock("@ui/models/ModelsPage", () => ({
  ModelsPage: () => <div>Models Page</div>,
}));

import { App } from "./App";

describe("App auto-update layout", () => {
  beforeEach(() => {
    cleanup();
    mockDispatch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the update banner on non-chat pages inside the sidebar layout", () => {
    render(
      <MemoryRouter initialEntries={["/terminal"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("Terminal Page")).toBeTruthy();
    expect(screen.getByText("Update Banner")).toBeTruthy();
  });
});
