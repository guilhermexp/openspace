// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { OtherTab } from "./OtherTab";
import type {
  UpdateAvailablePayload,
  UpdateDownloadedPayload,
  UpdateDownloadProgressPayload,
  UpdateErrorPayload,
} from "../../../../src/shared/desktop-bridge-contract";

const mockDispatch = vi.fn();
const mockGetDesktopApiOrNull = vi.fn();
const mockSetTerminalSidebar = vi.fn();
const mockSetActionLogCollapsedByDefault = vi.fn();
const mockFetch = vi.fn();
const mockGatewayRequest = vi.fn();
const mockCheckForUpdates = vi.fn(async () => undefined);
const mockDownloadUpdate = vi.fn(async () => undefined);
const mockInstallUpdate = vi.fn(async () => undefined);

const updateListeners: {
  available: Array<(payload: UpdateAvailablePayload) => void>;
  progress: Array<(payload: UpdateDownloadProgressPayload) => void>;
  downloaded: Array<(payload: UpdateDownloadedPayload) => void>;
  error: Array<(payload: UpdateErrorPayload) => void>;
} = {
  available: [],
  progress: [],
  downloaded: [],
  error: [],
};

function resetUpdateListeners() {
  updateListeners.available.length = 0;
  updateListeners.progress.length = 0;
  updateListeners.downloaded.length = 0;
  updateListeners.error.length = 0;
}

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
    resetUpdateListeners();
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
      checkForUpdate: mockCheckForUpdates,
      checkForUpdates: mockCheckForUpdates,
      downloadUpdate: mockDownloadUpdate,
      installUpdate: mockInstallUpdate,
      onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => {
        updateListeners.available.push(cb);
        return () => undefined;
      },
      onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => {
        updateListeners.progress.push(cb);
        return () => undefined;
      },
      onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => {
        updateListeners.downloaded.push(cb);
        return () => undefined;
      },
      onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => {
        updateListeners.error.push(cb);
        return () => undefined;
      },
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
    resetUpdateListeners();
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

  it("shows app update actions and advances through the updater states", async () => {
    render(
      <MemoryRouter>
        <OtherTab onError={vi.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByText("App update")).toBeTruthy();
    expect(await screen.findByText("Check and install OpenSpace desktop updates")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Checking..." }).hasAttribute("disabled")).toBe(
      true
    );

    act(() => {
      updateListeners.available[0]?.({ version: "1.4.0" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Download v1.4.0" }));

    expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Downloading..." }).hasAttribute("disabled")).toBe(
      true
    );

    act(() => {
      updateListeners.downloaded[0]?.({ version: "1.4.0" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Restart & Update" }));

    expect(mockInstallUpdate).toHaveBeenCalledTimes(1);
  });
});
