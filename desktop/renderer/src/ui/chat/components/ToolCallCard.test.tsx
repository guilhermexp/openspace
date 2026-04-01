// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ArtifactProvider } from "../context/ArtifactContext";
import { ToolCallCard } from "./ToolCallCard";

afterEach(() => {
  cleanup();
});

vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

describe("ToolCallCard", () => {
  const renderWithArtifactProvider = (ui: React.ReactNode) => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        resolveFilePath: vi.fn(async (filePath: string) => ({ path: filePath })),
        readFileText: vi.fn(async () => ({ content: "", mimeType: "text/plain" })),
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });

    return render(<ArtifactProvider>{ui}</ArtifactProvider>);
  };

  it("renders an inline audio player for tts tool results", async () => {
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

    await waitFor(() => {
      const audio = container.querySelector("audio");
      expect(audio).not.toBeNull();
      expect(audio?.getAttribute("src")).toBe(
        `data:application/octet-stream;base64,${btoa("/tmp/reply.opus")}`
      );
    });
  });

  it("offers a voice mode action for tts replies", async () => {
    const onVoiceReplyModeToggle = vi.fn();

    renderWithArtifactProvider(
      <ToolCallCard
        toolCall={{
          id: "tc-voice-loop",
          name: "tts",
          arguments: { text: "fala comigo" },
        }}
        result={{
          toolCallId: "tc-voice-loop",
          toolName: "tts",
          text: "Generated audio reply.",
          audioPath: "/tmp/voice-loop.mp3",
        }}
        onVoiceReplyModeToggle={onVoiceReplyModeToggle}
      />
    );

    const voiceModeButton = await screen.findByRole("button", {
      name: "Continue conversation by voice",
    });
    fireEvent.click(voiceModeButton);

    expect(onVoiceReplyModeToggle).toHaveBeenCalledWith(true);
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

  it("does not render duplicate audio players for the same tts file", async () => {
    const { container } = renderWithArtifactProvider(
      <ToolCallCard
        toolCall={{
          id: "tc-tts-dedupe",
          name: "tts",
          arguments: { text: "fala de novo" },
        }}
        result={{
          toolCallId: "tc-tts-dedupe",
          toolName: "tts",
          text: "Generated audio reply.",
          audioPath: "/tmp/voice-loop.mp3",
          attachments: [
            {
              type: "audio",
              mimeType: "audio/mpeg",
              filePath: "/tmp/voice-loop.mp3",
            },
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(container.querySelectorAll("audio")).toHaveLength(1);
    });
  });

  it("renders generated image attachments from file paths", async () => {
    const { container } = renderWithArtifactProvider(
      <ToolCallCard
        toolCall={{
          id: "tc-image",
          name: "image_generate",
          arguments: { prompt: "future city" },
        }}
        result={{
          toolCallId: "tc-image",
          toolName: "image_generate",
          text: "Generated 1 image with openai/gpt-image-1.",
          attachments: [
            {
              type: "image",
              mimeType: "image/png",
              filePath: "/tmp/generated/world-2029.png",
            },
          ],
        }}
      />
    );

    await waitFor(() => {
      const image = container.querySelector("img");
      expect(image).not.toBeNull();
      expect(image?.getAttribute("src")).toBe(
        `data:application/octet-stream;base64,${btoa("/tmp/generated/world-2029.png")}`
      );
    });
  });

  it("opens the artifact preview when clicking a read/write path argument", async () => {
    const readFileText = vi.fn(async () => ({
      content: "# from tool call",
      mimeType: "text/markdown",
    }));

    Object.defineProperty(window, "openclawDesktop", {
      value: {
        resolveFilePath: vi.fn(async (filePath: string) => ({ path: filePath })),
        readFileText,
        readFileDataUrl: vi.fn(async () => ({
          dataUrl: "data:application/octet-stream;base64,",
          mimeType: "application/octet-stream",
        })),
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

    await waitFor(() => {
      expect(readFileText).toHaveBeenCalledWith("/tmp/readme.md");
    });
  });
});
