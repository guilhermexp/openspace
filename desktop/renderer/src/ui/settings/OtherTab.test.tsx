// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { OtherTab } from "./OtherTab";

const mockDispatch = vi.fn();
const mockGetDesktopApiOrNull = vi.fn();
const mockSetTerminalSidebar = vi.fn();
const mockSetActionLogCollapsedByDefault = vi.fn();
const mockFetch = vi.fn();
const mockGatewayRequest = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      auth: { mode: "self-managed" },
    }),
}));

vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => ({
    connected: true,
    request: mockGatewayRequest,
  }),
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockGetDesktopApiOrNull(),
}));

vi.mock("@analytics", () => ({
  optInRenderer: vi.fn(),
  optOutRenderer: vi.fn(),
  getCurrentUserId: vi.fn(() => "user-1"),
}));

vi.mock("@shared/toast", () => ({
  errorToMessage: (err: unknown) => String(err),
}));

vi.mock("@shared/kit", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@shared/utils/openExternal", () => ({
  openExternal: vi.fn(),
}));

vi.mock("@shared/hooks/useTerminalSidebarVisible", () => ({
  useTerminalSidebarVisible: () => [false, mockSetTerminalSidebar] as const,
}));

vi.mock("@shared/hooks/useActionLogCollapsedByDefault", () => ({
  useActionLogCollapsedByDefault: () => [false, mockSetActionLogCollapsedByDefault] as const,
}));

vi.mock("./RestoreBackupModal", () => ({
  RestoreBackupModal: () => null,
}));

vi.mock("@store/slices/auth/authSlice", () => ({
  authActions: {
    clearAuthState: () => ({ type: "auth/clearAuthState" }),
    setMode: (mode: string) => ({ type: "auth/setMode", payload: mode }),
  },
  clearAuth: () => ({ type: "auth/clearAuth" }),
  persistMode: vi.fn(),
}));

describe("OtherTab", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serverVersion: "2026.3.26" }),
    });
    mockGatewayRequest.mockReset().mockResolvedValue({ ok: true, result: { status: "ok" } });
    mockGetDesktopApiOrNull.mockReturnValue({
      getLaunchAtLogin: vi.fn(async () => ({ enabled: false })),
      analyticsGet: vi.fn(async () => ({ enabled: false })),
      getOpenclawRuntimeInfo: vi.fn(async () => ({
        runtime: "bundled",
        updateSupported: false,
        reason: "Bundled OpenClaw is updated through OpenSpace app updates.",
      })),
      getGatewayInfo: vi.fn(async () => ({
        state: {
          kind: "ready",
          port: 31337,
          logsDir: "/tmp/logs",
          url: "http://127.0.0.1:31337/",
          token: "test-token",
        },
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("shows the current OpenClaw version from the legacy dashboard bootstrap source", async () => {
    render(
      <MemoryRouter>
        <OtherTab onError={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:31337/__openclaw/control-ui-config.json"
      );
    });

    expect(await screen.findByText("OpenClaw version")).toBeTruthy();
    expect(await screen.findByText("v2026.3.26")).toBeTruthy();
  });

  it("shows bundled update ownership when OpenClaw updates are managed by the app", async () => {
    render(
      <MemoryRouter>
        <OtherTab onError={vi.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByText("OpenClaw update")).toBeTruthy();
    expect(
      await screen.findByText("Bundled OpenClaw is updated through OpenSpace app updates.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Managed by app" }).hasAttribute("disabled")).toBe(
      true
    );
  });

  it("runs update.run when the runtime supports direct OpenClaw updates", async () => {
    const onError = vi.fn();
    mockGetDesktopApiOrNull.mockReturnValue({
      getLaunchAtLogin: vi.fn(async () => ({ enabled: false })),
      analyticsGet: vi.fn(async () => ({ enabled: false })),
      getOpenclawRuntimeInfo: vi.fn(async () => ({
        runtime: "dev-checkout",
        updateSupported: true,
        reason: null,
      })),
      getGatewayInfo: vi.fn(async () => ({
        state: {
          kind: "ready",
          port: 31337,
          logsDir: "/tmp/logs",
          url: "http://127.0.0.1:31337/",
          token: "test-token",
        },
      })),
    });

    render(
      <MemoryRouter>
        <OtherTab onError={onError} />
      </MemoryRouter>
    );

    const button = await screen.findByRole("button", { name: "Update now" });
    button.click();

    await waitFor(() => {
      expect(mockGatewayRequest).toHaveBeenCalledWith("update.run", {});
    });
    expect(onError).toHaveBeenCalledWith(null);
  });

  it("lets the user change the default action log collapse behavior", async () => {
    render(
      <MemoryRouter>
        <OtherTab onError={vi.fn()} />
      </MemoryRouter>
    );

    const toggle = await screen.findByLabelText("Collapse action logs by default");
    expect((toggle as HTMLInputElement).checked).toBe(false);

    fireEvent.click(toggle);

    expect(mockSetActionLogCollapsedByDefault).toHaveBeenCalledWith(true);
  });
});
