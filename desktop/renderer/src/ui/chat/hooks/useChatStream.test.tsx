// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useChatStream } from "./useChatStream";

function TestHarness(props: {
  gw: {
    request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
    onEvent: (cb: (evt: { event: string; payload: unknown }) => void) => () => void;
  };
  dispatch: (action: unknown) => void;
  sessionKey: string;
}) {
  useChatStream(props.gw, props.dispatch as never, props.sessionKey);
  return null;
}

describe("useChatStream", () => {
  it("keeps audioPath from tool result events", () => {
    let handler: ((evt: { event: string; payload: unknown }) => void) | null = null;
    const dispatch = vi.fn();
    const gw = {
      request: vi.fn(),
      onEvent: vi.fn((cb: (evt: { event: string; payload: unknown }) => void) => {
        handler = cb;
        return () => {};
      }),
    };

    render(<TestHarness gw={gw} dispatch={dispatch} sessionKey="session-1" />);

    handler?.({
      event: "agent",
      payload: {
        runId: "run-1",
        seq: 2,
        stream: "tool",
        ts: Date.now(),
        sessionKey: "session-1",
        data: {
          phase: "result",
          name: "tts",
          toolCallId: "tc-tts",
          result: {
            content: [{ type: "text", text: "Generated audio reply." }],
            details: {
              audioPath: "/tmp/reply.opus",
            },
          },
        },
      },
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat/toolCallFinished",
        payload: expect.objectContaining({
          toolCallId: "tc-tts",
          resultText: "Generated audio reply.",
          audioPath: "/tmp/reply.opus",
        }),
      })
    );
  });

  it("tracks run activity for other sessions without streaming them into the open chat", () => {
    let handler: ((evt: { event: string; payload: unknown }) => void) | null = null;
    const dispatch = vi.fn();
    const gw = {
      request: vi.fn(),
      onEvent: vi.fn((cb: (evt: { event: string; payload: unknown }) => void) => {
        handler = cb;
        return () => {};
      }),
    };

    render(<TestHarness gw={gw} dispatch={dispatch} sessionKey="session-1" />);

    handler?.({
      event: "chat",
      payload: {
        runId: "run-2",
        sessionKey: "session-2",
        seq: 1,
        state: "delta",
        message: { content: [{ type: "text", text: "hello from another session" }] },
      },
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat/sessionRunObserved",
        payload: { runId: "run-2", sessionKey: "session-2" },
      })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat/streamDeltaReceived",
      })
    );
  });
});
