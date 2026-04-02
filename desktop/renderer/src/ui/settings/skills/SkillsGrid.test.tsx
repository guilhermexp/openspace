// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SkillsGrid } from "./SkillsGrid";
import type { SkillId, SkillStatus } from "./useSkillsStatus";

function readSkillsFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");
}

function buildStatuses(overrides: Partial<Record<SkillId, SkillStatus>> = {}) {
  return {
    "google-workspace": "connect",
    "media-understanding": "connect",
    "web-search": "connect",
    notion: "connect",
    trello: "connect",
    "apple-notes": "connect",
    "apple-reminders": "connect",
    obsidian: "connect",
    github: "connect",
    slack: "connect",
    gemini: "coming-soon",
    "nano-banana": "coming-soon",
    sag: "coming-soon",
    ...overrides,
  } satisfies Record<SkillId, SkillStatus>;
}

describe("SkillsGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a connected badge and manage action for connected skills", () => {
    render(
      <SkillsGrid
        searchQuery="Notion"
        customSkills={[]}
        statuses={buildStatuses({ notion: "connected" })}
        onOpenModal={vi.fn()}
        onRemoveCustomSkill={vi.fn()}
      />
    );

    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
  });

  it("uses a two-column desktop grid and a dedicated connected badge style", () => {
    const css = readSkillsFile("./SkillsIntegrationsTab.module.css");

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toContain(".UiSkillMeta--connected");
    expect(css).toContain("var(--success)");
  });
});
