// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer } from "./ChatComposer";

vi.mock("./ChatAttachmentCard", () => ({
  ChatAttachmentCard: () => <div data-testid="mock-attachment-card" />,
  getFileTypeLabel: (t: string) => t,
}));

afterEach(() => {
  cleanup();
});

describe("ChatComposer", () => {
  it("shows send icon by default", () => {
    const { container } = render(
      <ChatComposer
        value="oi"
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
      />
    );

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton.querySelector("svg")).toBeTruthy();
    expect(container.querySelector(".UiChatSendSpinner")).toBeNull();
  });

  it("shows active spinner inside send button when agent is active", () => {
    const { container } = render(
      <ChatComposer
        value="oi"
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        isAgentActive
      />
    );

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(screen.getByLabelText("Session active")).toBeTruthy();
    expect(sendButton.querySelector("svg")).toBeNull();
  });

  it("keeps stop button when streaming mode is active", () => {
    const { container } = render(
      <ChatComposer
        value="oi"
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        streaming
        onStop={vi.fn()}
        isAgentActive
      />
    );

    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(container.querySelector(".UiChatSendSpinner")).toBeNull();
  });

  it("renders and toggles the voice replies chip", () => {
    const onVoiceReplyModeToggle = vi.fn();

    render(
      <ChatComposer
        value="oi"
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        voiceReplyMode
        onVoiceReplyModeToggle={onVoiceReplyModeToggle}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable voice replies" }));

    expect(screen.getByText("Voice replies on")).toBeTruthy();
    expect(onVoiceReplyModeToggle).toHaveBeenCalledWith(false);
  });

  it("keeps transcription mic and renders a second button for voice messages", () => {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        onVoiceStart={vi.fn()}
        onVoiceStop={vi.fn()}
        onVoiceMessageStart={vi.fn()}
        onVoiceMessageStop={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Hold to record voice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start voice message recording" })).toBeTruthy();
  });

  it("toggles the voice message button between start and send actions", () => {
    const onVoiceMessageStart = vi.fn();
    const onVoiceMessageStop = vi.fn();
    const { rerender } = render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        onVoiceMessageStart={onVoiceMessageStart}
        onVoiceMessageStop={onVoiceMessageStop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start voice message recording" }));
    expect(onVoiceMessageStart).toHaveBeenCalledTimes(1);
    expect(onVoiceMessageStop).not.toHaveBeenCalled();

    rerender(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onSend={vi.fn()}
        onVoiceMessageStart={onVoiceMessageStart}
        onVoiceMessageStop={onVoiceMessageStop}
        isVoiceMessageRecording
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send voice message" }));
    expect(onVoiceMessageStop).toHaveBeenCalledTimes(1);
  });
});
