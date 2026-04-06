// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDesktopApiOrNull = vi.fn();

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockGetDesktopApiOrNull(),
}));

vi.mock("@shared/kit", () => ({
  FooterText: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HeroPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PrimaryButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@shared/toast", () => ({
  errorToMessage: (err: unknown) => String(err),
}));

import { InstallOpenClawPage } from "./InstallOpenClawPage";

describe("InstallOpenClawPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the install CTA", async () => {
    mockGetDesktopApiOrNull.mockReturnValue({
      openclawCheckInstalled: vi.fn(async () => ({ installed: false, bin: null, dir: null })),
      openclawInstall: vi.fn(async () => ({
        ok: true,
        installed: true,
        bin: "/mock/bin/openclaw",
        dir: "/mock/lib/node_modules/openclaw",
        stdout: "",
        stderr: "",
        needsManualInstall: false,
        installCommand: "npm install -g openclaw@latest",
        daemonCommand: "openclaw onboard --install-daemon",
      })),
      startGateway: vi.fn(async () => ({ ok: true })),
    });

    render(<InstallOpenClawPage />);

    expect(await screen.findByRole("button", { name: "Install" })).toBeTruthy();
  });

  it("installs OpenClaw and starts the gateway", async () => {
    const startGateway = vi.fn(async () => ({ ok: true }));
    const openclawInstall = vi.fn(async () => ({
      ok: true,
      installed: true,
      bin: "/mock/bin/openclaw",
      dir: "/mock/lib/node_modules/openclaw",
      stdout: "installed",
      stderr: "",
      needsManualInstall: false,
      installCommand: "npm install -g openclaw@latest",
      daemonCommand: "openclaw onboard --install-daemon",
    }));
    mockGetDesktopApiOrNull.mockReturnValue({
      openclawCheckInstalled: vi.fn(async () => ({ installed: false, bin: null, dir: null })),
      openclawInstall,
      startGateway,
    });

    render(<InstallOpenClawPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(openclawInstall).toHaveBeenCalledTimes(1);
      expect(startGateway).toHaveBeenCalledTimes(1);
    });
  });
});
