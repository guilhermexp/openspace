// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionSidebarItem } from "./SessionSidebarItem";

function readSidebarFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");
}

describe("sidebar session activity indicator", () => {
  it("renders a dedicated active-session spinner when the row is busy", () => {
    render(
      <SessionSidebarItem
        sessionKey="sess_1"
        title="Active task"
        isActive
        isBusy
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Session active")).toBeTruthy();
  });

  it("uses a spinning indicator instead of the old pulse dot", () => {
    const css = readSidebarFile("./SessionSidebarItem.module.css");

    expect(css).toContain("@keyframes sessionSidebarSpin");
    expect(css).not.toContain("@keyframes sidebarPulse");
    expect(css).toContain(".SessionSidebarItem__spinnerRing");
  });
});
