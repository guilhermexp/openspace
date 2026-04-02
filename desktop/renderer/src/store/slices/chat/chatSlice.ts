import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type {
  ChatSliceState,
  LiveToolCall,
  UiMessage,
  UiMessageAttachment,
  UiToolCall,
  UiToolResult,
} from "./chat-types";
import { isApprovalContinueMessage, isHeartbeatMessage, isVoiceModeReceipt } from "./chat-utils";

export type { ChatSliceState, UiMessage, UiToolCall, UiToolResult, LiveToolCall };
export type { UiMessageAttachment, GatewayRequest, ChatAttachmentInput } from "./chat-types";
export {
  dataUrlToBase64,
  extractText,
  extractAttachmentsFromMessage,
  extractToolCalls,
  extractToolResult,
  isApprovalContinueMessage,
  isHeartbeatMessage,
  isVoiceModeReceipt,
  parseHistoryMessages,
  parseRole,
} from "./chat-utils";
export { abortChatRun, loadChatHistory, sendChatMessage } from "./chat-thunks";

const initialState: ChatSliceState = {
  messages: [],
  messagesBySessionKey: {},
  streamByRun: {},
  sending: false,
  error: null,
  epoch: 0,
  activeSessionKey: "",
  liveToolCalls: {},
  runSessionKeyByRunId: {},
  awaitingContinuation: false,
  historyLoading: false,
};

function clearTrackedRun(state: ChatSliceState, runId: string) {
  delete state.runSessionKeyByRunId[runId];
}

function syncActiveSessionCache(state: ChatSliceState) {
  if (!state.activeSessionKey) {
    return;
  }
  state.messagesBySessionKey[state.activeSessionKey] = state.messages;
}

function mergeHistoryWithLive(state: ChatSliceState, fromHistory: UiMessage[]): UiMessage[] {
  const lastHistoryTs =
    fromHistory.length > 0 ? Math.max(...fromHistory.map((m) => m.ts ?? 0)) : 0;
  const historyTexts = new Set(fromHistory.map((m) => m.text));
  const liveOnly: UiMessage[] = [];

  for (const m of state.messages) {
    if (m.ts == null || m.ts <= lastHistoryTs || historyTexts.has(m.text)) {
      continue;
    }
    if (m.role === "assistant" && m.runId) {
      liveOnly.push(m);
    } else if (m.role === "user") {
      liveOnly.push(m);
    }
  }

  return liveOnly.length > 0
    ? [
        ...fromHistory,
        ...[...liveOnly].sort((a: UiMessage, b: UiMessage) => (a.ts ?? 0) - (b.ts ?? 0)),
      ]
    : fromHistory;
}

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setSending(state, action: PayloadAction<boolean>) {
      state.sending = action.payload;
    },
    setAwaitingContinuation(state, action: PayloadAction<boolean>) {
      state.awaitingContinuation = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    /** Activate another session and hydrate any cached transcript while fresh history loads. */
    sessionCleared(state, action: PayloadAction<string>) {
      state.messages = state.messagesBySessionKey[action.payload] ?? [];
      state.streamByRun = {};
      state.liveToolCalls = {};
      state.awaitingContinuation = false;
      state.historyLoading = true;
      state.epoch += 1;
      state.activeSessionKey = action.payload;
    },
    historyLoaded(
      state,
      action: PayloadAction<{ sessionKey: string; messages: UiMessage[] }>
    ) {
      const { sessionKey, messages: fromHistory } = action.payload;
      const isInitialLoad = !state.activeSessionKey;
      if (!isInitialLoad && state.activeSessionKey !== sessionKey) {
        state.messagesBySessionKey[sessionKey] = fromHistory;
        return;
      }

      if (isInitialLoad) {
        state.activeSessionKey = sessionKey;
      }
      state.messages = mergeHistoryWithLive(state, fromHistory);
      state.messagesBySessionKey[sessionKey] = state.messages;
      state.historyLoading = false;
      // Selectively clean up completed streams instead of clearing all.
      // Active streams for in-flight runs must persist so the UI keeps
      // showing the typing indicator for pending responses.
      const finalizedRunIds = new Set<string>();
      for (const m of state.messages) {
        if (m.role === "assistant" && m.runId) {
          finalizedRunIds.add(m.runId);
        }
      }
      for (const runId of Object.keys(state.streamByRun)) {
        if (finalizedRunIds.has(runId)) {
          delete state.streamByRun[runId];
        }
      }

      // Resolve approval-pending statuses and clear the loader when the
      // closing continue/denied message has appeared in history.
      const allMsgs = state.messages;
      for (let i = 0; i < allMsgs.length; i++) {
        const msg = allMsgs[i];
        if (!msg.toolResults?.some((r) => r.status === "approval-pending")) {
          continue;
        }
        let resolvedAs: "approved" | "denied" | null = null;
        for (let j = i + 1; j < allMsgs.length; j++) {
          if (isApprovalContinueMessage(allMsgs[j].role, allMsgs[j].text)) {
            const word = allMsgs[j].text.trim().toLowerCase();
            resolvedAs = word === "denied" ? "denied" : "approved";
            break;
          }
        }
        if (resolvedAs && msg.toolResults) {
          for (const r of msg.toolResults) {
            if (r.status === "approval-pending") {
              r.status = resolvedAs;
            }
          }
        }
      }

      if (state.awaitingContinuation) {
        const hasPendingLeft = allMsgs.some((m) =>
          m.toolResults?.some((r) => r.status === "approval-pending")
        );
        if (!hasPendingLeft) {
          state.awaitingContinuation = false;
        }
      }
    },
    historyLoadFailed(
      state,
      action: PayloadAction<{ sessionKey: string; errorMessage?: string }>
    ) {
      if (state.activeSessionKey !== action.payload.sessionKey) {
        return;
      }
      state.historyLoading = false;
      if (action.payload.errorMessage) {
        state.error = action.payload.errorMessage;
      }
    },
    userMessageQueued(
      state,
      action: PayloadAction<{
        localId: string;
        message: string;
        attachments?: UiMessageAttachment[];
      }>
    ) {
      state.messages.push({
        id: action.payload.localId,
        role: "user",
        text: action.payload.message,
        ts: Date.now(),
        pending: true,
        attachments: action.payload.attachments,
      });
      syncActiveSessionCache(state);
    },
    markUserMessageDelivered(state, action: PayloadAction<{ localId: string }>) {
      state.messages = state.messages.map((m) =>
        m.id === action.payload.localId ? { ...m, pending: false } : m
      );
      syncActiveSessionCache(state);
    },
    ensureStreamRun(state, action: PayloadAction<{ runId: string; sessionKey?: string }>) {
      const runId = action.payload.runId;
      if (action.payload.sessionKey) {
        state.runSessionKeyByRunId[runId] = action.payload.sessionKey;
      }
      if (state.streamByRun[runId]) {
        return;
      }
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text: "",
        runId,
        ts: Date.now(),
      };
    },
    sessionRunObserved(state, action: PayloadAction<{ runId: string; sessionKey: string }>) {
      state.runSessionKeyByRunId[action.payload.runId] = action.payload.sessionKey;
    },
    sessionRunFinished(state, action: PayloadAction<{ runId: string }>) {
      clearTrackedRun(state, action.payload.runId);
    },
    streamDeltaReceived(state, action: PayloadAction<{ runId: string; text: string }>) {
      const runId = action.payload.runId;
      if (
        isHeartbeatMessage("assistant", action.payload.text) ||
        isVoiceModeReceipt("assistant", action.payload.text)
      ) {
        return;
      }
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text: action.payload.text,
        runId,
        ts: Date.now(),
      };
    },
    streamFinalReceived(
      state,
      action: PayloadAction<{
        runId: string;
        seq: number;
        text: string;
        toolCalls?: UiToolCall[];
      }>
    ) {
      const { runId, seq, text, toolCalls } = action.payload;
      delete state.streamByRun[runId];
      clearTrackedRun(state, runId);

      const liveForRun: UiToolCall[] = [];
      const liveResultsForRun: UiToolResult[] = [];
      for (const key of Object.keys(state.liveToolCalls)) {
        const ltc = state.liveToolCalls[key];
        if (ltc.runId === runId) {
          liveForRun.push({
            id: ltc.toolCallId,
            name: ltc.name,
            arguments: ltc.arguments,
          });
          if (ltc.phase === "result" && ltc.resultText) {
            liveResultsForRun.push({
              toolCallId: ltc.toolCallId,
              toolName: ltc.name,
              text: ltc.resultText,
              status: ltc.isError ? "error" : undefined,
              audioPath: ltc.audioPath,
              attachments: ltc.attachments,
            });
          }
          delete state.liveToolCalls[key];
        }
      }

      const allToolCalls = [
        ...(toolCalls ?? []),
        ...liveForRun.filter((ltc) => !toolCalls?.some((tc) => tc.id === ltc.id)),
      ];
      const hasToolCalls = allToolCalls.length > 0;

      if (!text && !hasToolCalls) {
        return;
      }
      if (text && (isHeartbeatMessage("assistant", text) || isVoiceModeReceipt("assistant", text))) {
        return;
      }
      state.messages.push({
        id: `a-${runId}-${seq}`,
        role: "assistant",
        text,
        runId,
        ts: Date.now(),
        toolCalls: hasToolCalls ? allToolCalls : undefined,
        toolResults: liveResultsForRun.length > 0 ? liveResultsForRun : undefined,
      });
      syncActiveSessionCache(state);
    },
    streamErrorReceived(state, action: PayloadAction<{ runId: string; errorMessage?: string }>) {
      delete state.streamByRun[action.payload.runId];
      clearTrackedRun(state, action.payload.runId);
      if (action.payload.errorMessage) {
        state.error = action.payload.errorMessage;
      }
    },
    streamAborted(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
      clearTrackedRun(state, action.payload.runId);
    },
    streamCleared(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
      clearTrackedRun(state, action.payload.runId);
    },
    /** A tool call started (agent event with stream="tool", phase="start"). */
    toolCallStarted(
      state,
      action: PayloadAction<{
        toolCallId: string;
        runId: string;
        name: string;
        arguments: Record<string, unknown>;
      }>
    ) {
      const { toolCallId, runId, name, arguments: args } = action.payload;
      state.liveToolCalls[toolCallId] = {
        toolCallId,
        runId,
        name,
        arguments: args,
        phase: "start",
      };
    },
    /** A tool call finished (agent event with stream="tool", phase="result"). */
    toolCallFinished(
      state,
      action: PayloadAction<{
        toolCallId: string;
        resultText?: string;
        isError?: boolean;
        audioPath?: string;
        attachments?: UiMessageAttachment[];
      }>
    ) {
      const entry = state.liveToolCalls[action.payload.toolCallId];
      if (entry) {
        entry.phase = "result";
        entry.resultText = action.payload.resultText;
        entry.isError = action.payload.isError;
        entry.audioPath = action.payload.audioPath;
        entry.attachments = action.payload.attachments;
      }
    },
    /** Clear all live tool calls for a given runId (e.g. when the run finishes). */
    liveToolCallsClearedForRun(state, action: PayloadAction<{ runId: string }>) {
      for (const key of Object.keys(state.liveToolCalls)) {
        if (state.liveToolCalls[key].runId === action.payload.runId) {
          delete state.liveToolCalls[key];
        }
      }
    },
  },
});

export const chatActions = chatSlice.actions;
export const chatReducer = chatSlice.reducer;
