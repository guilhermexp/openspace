// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactPanel, getArtifactRenderKind } from "./ArtifactPanel";
import { resolveArtifactHrefToPath } from "./artifact-preview";
import { ArtifactProvider, useArtifact } from "../context/ArtifactContext";

function createDesktopApi() {
  return {
    resolveFilePath: vi.fn(async (filePath: string) => ({ path: filePath })),
    readFileText: vi.fn(async () => ({ content: "# hello", mimeType: "text/markdown" })),
    listOpenTargets: vi.fn(async () => ({
      targets: [
        { id: "default", label: "Default app", kind: "default" },
        { id: "finder", label: "Finder", kind: "finder" },
        { id: "chrome", label: "Google Chrome", kind: "app" },
      ],
    })),
    openFileWith: vi.fn(async () => ({ ok: true })),
    openExternal: vi.fn(async () => {}),
  } as unknown as NonNullable<Window["openclawDesktop"]>;
}

function ArtifactPanelHarness({ filePath = "/tmp/readme.md" }: { filePath?: string }) {
  const { openArtifact } = useArtifact();

  React.useEffect(() => {
    void openArtifact(filePath);
  }, [filePath, openArtifact]);

  return <ArtifactPanel />;
}

describe("getArtifactRenderKind", () => {
  beforeEach(() => {
    Object.defineProperty(window, "openclawDesktop", {
      value: createDesktopApi(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects markdown, code, media, html, and plain text previews", () => {
    expect(getArtifactRenderKind("/tmp/readme.md")).toBe("markdown");
    expect(getArtifactRenderKind("/tmp/component.tsx")).toBe("code");
    expect(getArtifactRenderKind("/tmp/image.png")).toBe("image");
    expect(getArtifactRenderKind("/tmp/report.pdf")).toBe("pdf");
    expect(getArtifactRenderKind("/tmp/demo.mp4")).toBe("video");
    expect(getArtifactRenderKind("/tmp/index.html")).toBe("html");
    expect(getArtifactRenderKind("/tmp/notes.txt")).toBe("text");
  });

  it("resolves home-relative artifact links without falling back to external open", () => {
    expect(resolveArtifactHrefToPath("~/notes.md")).toBe("~/notes.md");
    expect(resolveArtifactHrefToPath("~/.agents/skills/coding-agent/SKILL.md")).toBe(
      "~/.agents/skills/coding-agent/SKILL.md"
    );
  });

  it("shows an open menu with default app, Finder, and detected apps", async () => {
    render(
      <ArtifactProvider>
        <ArtifactPanelHarness />
      </ArtifactProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open file options" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open file options" }));
    });

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Default app" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Finder" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Google Chrome" })).toBeTruthy();
  });
});
