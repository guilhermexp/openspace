// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConnectorsTab } from "./ConnectorsTab";

vi.mock("./useConnectorsStatus", () => ({
  useConnectorsStatus: () => ({
    statuses: {
      telegram: "connected",
      slack: "connect",
      discord: "connect",
      whatsapp: "connect",
      signal: "connect",
      imessage: "connect",
      matrix: "coming-soon",
      msteams: "coming-soon",
    },
    markConnected: vi.fn(),
    markDisabled: vi.fn(),
    refresh: vi.fn(),
    loadConfig: vi.fn(),
  }),
  disableConnector: vi.fn(),
}));

function readConnectorsFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");
}

describe("ConnectorsTab", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a connected badge and manage action for connected connectors", () => {
    render(
      <ConnectorsTab
        gw={{ request: vi.fn() }}
        configSnap={null}
        reload={vi.fn(async () => {})}
        onError={vi.fn()}
      />
    );

    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
  });

  it("uses a two-column desktop grid and a dedicated connected badge style", () => {
    const css = readConnectorsFile("./ConnectorsTab.module.css");

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toContain(".ConnectorMeta--connected");
    expect(css).toContain("var(--success)");
  });
});
