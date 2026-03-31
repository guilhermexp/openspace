// @vitest-environment jsdom
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactProvider, useArtifact } from "./ArtifactContext";

type DeferredReadResult = {
  content: string;
  mimeType: string;
};

function createDesktopApi(readFileText?: (filePath: string) => Promise<DeferredReadResult>) {
  return {
    readFileText:
      readFileText ??
      vi.fn(async () => ({
        content: "",
        mimeType: "text/plain",
      })),
    openExternal: vi.fn(async () => {}),
  } as unknown as NonNullable<Window["openclawDesktop"]>;
}

describe("ArtifactContext", () => {
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

  it("loads text artifacts through the desktop bridge", async () => {
    let resolveRead: ((value: DeferredReadResult) => void) | null = null;
    const readFileText = vi.fn(
      () =>
        new Promise<DeferredReadResult>((resolve) => {
          resolveRead = resolve;
        })
    );

    Object.defineProperty(window, "openclawDesktop", {
      value: createDesktopApi(readFileText),
      writable: true,
      configurable: true,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ArtifactProvider>{children}</ArtifactProvider>
    );
    const { result } = renderHook(() => useArtifact(), { wrapper });

    act(() => {
      void result.current.openArtifact("/tmp/readme.md");
    });

    expect(result.current.filePath).toBe("/tmp/readme.md");
    expect(result.current.loading).toBe(true);
    expect(readFileText).toHaveBeenCalledWith("/tmp/readme.md");

    await act(async () => {
      resolveRead?.({ content: "# Preview", mimeType: "text/markdown" });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.fileContent).toBe("# Preview");
      expect(result.current.error).toBeNull();
    });
  });

  it("skips bridge reads for binary artifacts and resets on close", async () => {
    const readFileText = vi.fn(async () => ({
      content: "should not load",
      mimeType: "text/plain",
    }));

    Object.defineProperty(window, "openclawDesktop", {
      value: createDesktopApi(readFileText),
      writable: true,
      configurable: true,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ArtifactProvider>{children}</ArtifactProvider>
    );
    const { result } = renderHook(() => useArtifact(), { wrapper });

    act(() => {
      void result.current.openArtifact("/tmp/screenshot.png");
    });

    expect(result.current.filePath).toBe("/tmp/screenshot.png");
    expect(result.current.fileContent).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(readFileText).not.toHaveBeenCalled();

    act(() => {
      result.current.closeArtifact();
    });

    expect(result.current.filePath).toBeNull();
    expect(result.current.fileContent).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
