import React from "react";
import type { AppDispatch } from "@store/store";
import {
  chatActions,
  extractText,
  extractToolResult,
  extractToolCalls,
  loadChatHistory,
} from "@store/slices/chat/chatSlice";
import { agentStatusActions } from "@store/slices/agentStatusSlice";
import { HIDDEN_TOOL_NAMES } from "../components/ToolCallCard";

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

type AgentEvent = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  onEvent: (cb: (evt: { event: string; payload: unknown }) => void) => () => void;
};

/** Subscribe to gateway chat events and dispatch stream actions for the given session. */
export function useChatStream(gw: GatewayRpc, dispatch: AppDispatch, sessionKey: string) {
  React.useEffect(() => {
    return gw.onEvent((evt) => {
      // Handle chat events (text streaming)
      if (evt.event === "chat") {
        const payload = evt.payload as ChatEvent;
        if (payload.sessionKey !== sessionKey) {
          return;
        }
        if (payload.state === "delta") {
          const text = extractText(payload.message);
          dispatch(chatActions.streamDeltaReceived({ runId: payload.runId, text }));
          return;
        }
        if (payload.state === "final") {
          const text = extractText(payload.message);
          const toolCalls = extractToolCalls(payload.message);
          // streamFinalReceived also collects live tool calls for this runId
          // and merges them into the finalized message, then clears them.
          dispatch(
            chatActions.streamFinalReceived({
              runId: payload.runId,
              seq: payload.seq,
              text,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            })
          );
          // Reload full chat history from the server, matching the web admin
          // behavior. The server-side history contains final tool results
          // (e.g. after exec approval) which replace the streamed versions.
          void dispatch(loadChatHistory({ request: gw.request, sessionKey, limit: 200 }));
          return;
        }
        if (payload.state === "error") {
          dispatch(
            chatActions.streamErrorReceived({
              runId: payload.runId,
              errorMessage: payload.errorMessage,
            })
          );
          return;
        }
        if (payload.state === "aborted") {
          dispatch(chatActions.streamAborted({ runId: payload.runId }));
        }
        return;
      }

      // Handle agent events (tool call streaming + lifecycle)
      if (evt.event === "agent") {
        const payload = evt.payload as AgentEvent;
        if (payload.sessionKey && payload.sessionKey !== sessionKey) {
          return;
        }

        // Capture lifecycle events to extract model/usage metadata.
        // The gateway emits phase at payload.data.phase (tool events) or as
        // a top-level field on the raw payload object.
        const lifecyclePhase =
          payload.stream === "lifecycle"
            ? (payload.data.phase ?? (payload as Record<string, unknown>).phase)
            : null;

        if (lifecyclePhase === "end") {
          // The gateway may attach usage metadata to the lifecycle:end event.
          const d = payload.data;
          const model = typeof d.model === "string" ? d.model : null;
          const inputTokens = typeof d.inputTokens === "number" ? d.inputTokens : 0;
          const outputTokens = typeof d.outputTokens === "number" ? d.outputTokens : 0;
          const contextWindow = typeof d.contextWindow === "number" ? d.contextWindow : 0;

          if (model) {
            dispatch(
              agentStatusActions.statusUpdated({
                model,
                inputTokens,
                outputTokens,
                contextWindow,
              })
            );
          } else {
            // Fallback: try fetching status from the gateway
            gw.request<Record<string, unknown>>("status", { sessionKey })
              .then((res) => {
                const sessions = res.sessions as Array<Record<string, unknown>> | undefined;
                const s0 = sessions?.[0];
                if (s0 && typeof s0.model === "string") {
                  dispatch(
                    agentStatusActions.statusUpdated({
                      model: s0.model as string,
                      inputTokens: (s0.inputTokens as number) ?? 0,
                      outputTokens: (s0.outputTokens as number) ?? 0,
                      contextWindow: (s0.contextWindow as number) ?? 0,
                      agentId: s0.agentId as string | undefined,
                    })
                  );
                }
              })
              .catch(() => {
                // Best-effort
              });
          }
        }

        if (payload.stream !== "tool") {
          return;
        }
        const { data, runId } = payload;
        const phase = typeof data.phase === "string" ? data.phase : "";
        const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
        const name = typeof data.name === "string" ? data.name : "";

        if (phase === "start" && toolCallId && name) {
          if (HIDDEN_TOOL_NAMES.has(name)) {
            return;
          }
          const args =
            data.args && typeof data.args === "object"
              ? (data.args as Record<string, unknown>)
              : {};
          dispatch(chatActions.toolCallStarted({ toolCallId, runId, name, arguments: args }));
          return;
        }
        if (phase === "result" && toolCallId) {
          const extractedResult =
            data.result && typeof data.result === "object"
              ? extractToolResult({
                  role: "toolResult",
                  toolCallId,
                  toolName: name || "unknown",
                  content: (data.result as Record<string, unknown>).content,
                  details: (data.result as Record<string, unknown>).details,
                })
              : null;
          const resultText =
            extractedResult?.text ||
            (typeof data.result === "string"
              ? data.result
              : data.result != null
                ? JSON.stringify(data.result, null, 2)
                : undefined);
          dispatch(
            chatActions.toolCallFinished({
              toolCallId,
              resultText,
              isError: typeof data.isError === "boolean" ? data.isError : undefined,
              audioPath: extractedResult?.audioPath,
              attachments: extractedResult?.attachments,
            })
          );
        }
      }
    });
  }, [dispatch, gw, sessionKey]);
}
