// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { AccountTab } from "./AccountTab";

const mockRequest = vi.fn();
const mockDispatch = vi.fn();
const mockAddToast = vi.fn();
const mockAddToastError = vi.fn();
const mockCreateAddonCheckout = vi.fn();
const mockGetDesktopApiOrNull = vi.fn();
const mockOpenExternal = vi.fn();

const mockAuthState = {
  mode: "paid",
  jwt: "jwt-token",
  email: "user@test.com",
  balance: null,
  topUpPending: false,
};

const mockHandleLogout = vi.fn((payload: unknown) => ({ type: "auth/handleLogout", payload }));

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) =>
    selector({
      auth: mockAuthState,
    }),
}));

vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => ({ request: mockRequest }),
}));

const mockFetchBalance = vi.fn(() => ({ type: "auth/fetchBalance" }));

vi.mock("@store/slices/authSlice", () => ({
  storeAuthToken: vi.fn((payload: unknown) => ({ type: "auth/storeToken", payload })),
  switchToSubscription: vi.fn((payload: unknown) => ({
    type: "auth/switchToSubscription",
    payload,
  })),
  applySubscriptionKeys: vi.fn((payload: unknown) => ({
    type: "auth/applySubscriptionKeys",
    payload,
  })),
  handleLogout: (payload: unknown) => mockHandleLogout(payload),
  createAddonCheckout: (payload: unknown) => mockCreateAddonCheckout(payload),
  fetchBalance: () => mockFetchBalance(),
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockGetDesktopApiOrNull(),
}));

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getPortalUrl: vi.fn(),
  },
}));

vi.mock("@shared/toast", () => ({
  addToast: (message: string) => mockAddToast(message),
  addToastError: (error: unknown) => mockAddToastError(error),
}));

vi.mock("@shared/kit", () => ({
  SecondaryButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Modal: ({
    open,
    header,
    children,
  }: {
    open: boolean;
    header: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{header}</h2>
        {children}
      </div>
    ) : null,
}));

describe("AccountTab logout confirmation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDesktopApiOrNull.mockReturnValue(null);
    mockCreateAddonCheckout.mockImplementation((payload: unknown) => ({
      type: "auth/createAddonCheckout",
      payload,
    }));
    mockAuthState.topUpPending = false;
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ checkoutUrl: "https://stripe.test/checkout" }),
    });
  });

  it("opens confirmation popup and closes on cancel without logout", () => {
    render(<AccountTab />);

    fireEvent.click(screen.getByTitle("Log out"));

    expect(screen.getByText("Log out?")).not.toBeNull();
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Log out?")).toBeNull();
    expect(mockHandleLogout).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("confirms logout and dispatches handleLogout flow", async () => {
    render(<AccountTab />);

    fireEvent.click(screen.getByTitle("Log out"));
    fireEvent.click(screen.getByText("Log out"));

    await waitFor(() => {
      expect(mockHandleLogout).toHaveBeenCalledWith({ request: mockRequest });
      expect(mockDispatch).toHaveBeenCalled();
    });
    expect(mockAddToast).toHaveBeenCalledWith("Logged out. Sign in again anytime.");
    expect(mockAddToastError).not.toHaveBeenCalled();
  });

  it("dispatches top-up thunk and opens checkout url", async () => {
    mockGetDesktopApiOrNull.mockReturnValue({ openExternal: mockOpenExternal });
    render(<AccountTab />);

    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockCreateAddonCheckout).toHaveBeenCalledWith({ amountUsd: 10 });
      expect(mockOpenExternal).toHaveBeenCalledWith("https://stripe.test/checkout");
    });
  });

  it("shows validation toast and skips thunk on invalid amount", async () => {
    render(<AccountTab />);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith("Enter a valid amount");
    });
    expect(mockCreateAddonCheckout).not.toHaveBeenCalled();
  });

  it("shows error toast when top-up thunk fails", async () => {
    const failure = new Error("Top-up failed");
    mockDispatch.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(failure),
    });

    render(<AccountTab />);
    fireEvent.click(screen.getByText("Top Up"));

    await waitFor(() => {
      expect(mockAddToastError).toHaveBeenCalledWith(failure);
    });
  });

  it("dispatches fetchBalance and shows toast on addon-success deep link", async () => {
    let deepLinkCb:
      | ((payload: { host: string; pathname: string; params: Record<string, string> }) => void)
      | null = null;
    mockGetDesktopApiOrNull.mockReturnValue({
      openExternal: mockOpenExternal,
      onDeepLink: (cb: typeof deepLinkCb) => {
        deepLinkCb = cb;
        return () => {
          deepLinkCb = null;
        };
      },
    });

    render(<AccountTab />);

    expect(deepLinkCb).not.toBeNull();
    deepLinkCb!({ host: "addon-success", pathname: "/", params: {} });

    await waitFor(() => {
      expect(mockFetchBalance).toHaveBeenCalled();
      expect(mockAddToast).toHaveBeenCalledWith("Balance updated!");
    });
  });
});
