// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ToolCallCard } from "./ToolCallCard";

describe("ToolCallCard", () => {
  it("renders an inline audio player for tts tool results", () => {
    const { container } = render(
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
    const { container } = render(
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
});
