// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ArtifactProvider } from "../context/ArtifactContext";
import { ToolCallCard } from "./ToolCallCard";

describe("ToolCallCard", () => {
  const renderWithArtifactProvider = (ui: React.ReactNode) => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileText: vi.fn(async () => ({ content: "", mimeType: "text/plain" })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });

    return render(<ArtifactProvider>{ui}</ArtifactProvider>);
  };

  it("renders an inline audio player for tts tool results", () => {
    const { container } = renderWithArtifactProvider(
      <ToolCallCard
        toolCall={{
          id: "tc-tts",
          name: "tts",
          arguments: { text: "hello" },
        }}
        result={{
          toolCallId: "tc-tts",
          toolName: "tts",
          text: "Generated audio reply.",
          audioPath: "/tmp/reply.opus",
        }}
      />
    );

    expect(screen.getByText("Text to speech")).not.toBeNull();

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe("file:///tmp/reply.opus");
  });

  it("renders audio attachments inline instead of a file card", () => {
    const { container } = renderWithArtifactProvider(
      <ToolCallCard
        toolCall={{
          id: "tc-audio",
          name: "read",
          arguments: {},
        }}
        result={{
          toolCallId: "tc-audio",
          toolName: "read",
          text: "Audio attachment",
          attachments: [
            {
              type: "audio",
              mimeType: "audio/ogg",
              dataUrl: "data:audio/ogg;base64,abc123",
            },
          ],
        }}
      />
    );

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe("data:audio/ogg;base64,abc123");
  });

  it("opens the artifact preview when clicking a read/write path argument", () => {
    const readFileText = vi.fn(async () => ({
      content: "# from tool call",
      mimeType: "text/markdown",
    }));

    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileText,
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });

    render(
      <ArtifactProvider>
        <ToolCallCard
          toolCall={{
            id: "tc-read",
            name: "read",
            arguments: { path: "/tmp/readme.md" },
          }}
        />
      </ArtifactProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "/tmp/readme.md" }));

    expect(readFileText).toHaveBeenCalledWith("/tmp/readme.md");
  });
});
