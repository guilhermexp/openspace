import React from "react";
import { useSearchParams } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  chatActions,
  isHeartbeatMessage,
  isApprovalContinueMessage,
  loadChatHistory,
  sendChatMessage,
  type ChatAttachmentInput,
} from "@store/slices/chat/chatSlice";
import { upgradePaywallActions } from "@store/slices/upgradePaywallSlice";
import type { GatewayState } from "@main/types";
import { HIDDEN_TOOL_NAMES } from "./components/ToolCallCard";
import { ArtifactDivider } from "./components/ArtifactDivider";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { ChatComposer, type ChatComposerRef } from "./components/ChatComposer";
import { ChatMessageList } from "./components/ChatMessageList";
import { ScrollToBottomButton } from "./components/ScrollToBottomButton";
import { clampArtifactPanelWidth } from "./components/artifact-preview";
import { ArtifactProvider, useArtifact } from "./context/ArtifactContext";
import { useOptimisticSession } from "./hooks/optimisticSessionContext";
import { useChatStream } from "./hooks/useChatStream";
import { useMarkdownComponents } from "./hooks/useMarkdownComponents";
import { useVoiceConfig } from "./hooks/useVoiceConfig";
import { addToastError } from "@shared/toast";
import ct from "./ChatTranscript.module.css";

const ARTIFACT_PANEL_BREAKPOINT = 960;

function ChatPageContent({ state: _state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [searchParams] = useSearchParams();
  const sessionKey = searchParams.get("session") ?? "";
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<ChatAttachmentInput[]>([]);
  const artifact = useArtifact();
  const { optimistic, setOptimistic } = useOptimisticSession();
  const optimisticFirstMessage =
    optimistic?.key === sessionKey ? (optimistic.firstMessage ?? null) : null;
  const optimisticFirstAttachments =
    optimistic?.key === sessionKey ? (optimistic.firstAttachments ?? null) : null;

  const dispatch = useAppDispatch();
  const rawMessages = useAppSelector((s) => s.chat.messages);
  const activeSessionKey = useAppSelector((s) => s.chat.activeSessionKey);
  const messages = React.useMemo(
    () => (activeSessionKey === sessionKey ? rawMessages : []),
    [activeSessionKey, rawMessages, sessionKey]
  );
  const rawStreamByRun = useAppSelector((s) => s.chat.streamByRun);
  const streamByRun = activeSessionKey === sessionKey ? rawStreamByRun : {};
  const rawLiveToolCalls = useAppSelector((s) => s.chat.liveToolCalls);
  const liveToolCalls = activeSessionKey === sessionKey ? Object.values(rawLiveToolCalls) : [];
  const sending = useAppSelector((s) => s.chat.sending);
  const awaitingContinuation = useAppSelector((s) => s.chat.awaitingContinuation);
  const error = useAppSelector((s) => s.chat.error);
  const authMode = useAppSelector((s) => s.auth.mode);
  const subscription = useAppSelector((s) => s.auth.subscription);
  const isAuthorized = useAppSelector((s) => s.auth.jwt != null);
  const needsUpgradePaywall =
    isAuthorized &&
    authMode === "paid" &&
    (subscription === null || subscription.status === "canceled");

  const gw = useGatewayRpc();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<ChatComposerRef | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    console.log(behavior, "behavior");
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const markdownComponents = useMarkdownComponents({ onOpenArtifact: artifact.openArtifact });
  const voiceConfig = useVoiceConfig(gw.request, composerRef, setInput);

  const matchingFirstUserFromHistory = React.useMemo(() => {
    if (optimisticFirstMessage === null) {
      return null;
    }
    const userMsg = messages.find(
      (m) => m.role === "user" && m.text.startsWith(optimisticFirstMessage)
    );
    return userMsg ?? null;
  }, [messages, optimisticFirstMessage]);

  const hasUserFromHistory = messages.some((m) => m.role === "user");
  React.useEffect(() => {
    if (optimistic?.key === sessionKey && hasUserFromHistory) {
      setOptimistic(null);
    }
  }, [optimistic?.key, sessionKey, hasUserFromHistory, setOptimistic]);

  useChatStream(gw as Parameters<typeof useChatStream>[0], dispatch, sessionKey);

  const refresh = React.useCallback(() => {
    void dispatch(loadChatHistory({ request: gw.request, sessionKey, limit: 200 }));
  }, [dispatch, gw.request, sessionKey]);

  React.useEffect(() => {
    dispatch(chatActions.sessionCleared(sessionKey));
    refresh();
  }, [sessionKey, dispatch, refresh]);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => composerRef.current?.focusInput());
    return () => cancelAnimationFrame(id);
  }, [sessionKey]);

  const allMessages =
    matchingFirstUserFromHistory != null
      ? messages
      : optimisticFirstMessage != null && !hasUserFromHistory
        ? [{ id: "opt-first", role: "user" as const, text: optimisticFirstMessage }, ...messages]
        : messages;
  const displayMessages = allMessages.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      (m.text.trim() !== "" ||
        (m.toolCalls && m.toolCalls.some((tc) => !HIDDEN_TOOL_NAMES.has(tc.name)))) &&
      !isHeartbeatMessage(m.role, m.text) &&
      !isApprovalContinueMessage(m.role, m.text)
  );

  const hasActiveStream = Object.keys(streamByRun).length > 0 || liveToolCalls.length > 0;
  const waitingForFirstResponse =
    (displayMessages.some((m) => m.role === "user") &&
      !displayMessages.some((m) => m.role === "assistant") &&
      !hasActiveStream) ||
    (awaitingContinuation && !hasActiveStream);

  const prevDisplayCountRef = React.useRef(0);
  const prevMessagesLengthRef = React.useRef(messages.length);
  const lastMessageRole = messages[messages.length - 1]?.role;

  React.useEffect(() => {
    const loaded = displayMessages.length > 0 && prevDisplayCountRef.current === 0;
    prevDisplayCountRef.current = displayMessages.length;

    const userJustSent =
      messages.length === prevMessagesLengthRef.current + 1 && lastMessageRole === "user";
    prevMessagesLengthRef.current = messages.length;

    if (loaded || userJustSent) {
      const behavior: ScrollBehavior = loaded ? "instant" : "smooth";
      const id = requestAnimationFrame(() => scrollToBottom(behavior));
      return () => cancelAnimationFrame(id);
    }
  }, [displayMessages.length, messages.length, lastMessageRole, scrollToBottom]);

  // Auto-scroll to bottom while agent is actively streaming
  React.useEffect(() => {
    if (!hasActiveStream && !sending) {
      return;
    }
    const id = setInterval(() => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      // Only auto-scroll if user is near the bottom (within 150px)
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }, 300);
    return () => clearInterval(id);
  }, [hasActiveStream, sending]);

  React.useEffect(() => {
    if (error) {
      addToastError(error);
      dispatch(chatActions.setError(null));
    }
  }, [error, dispatch]);

  React.useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const send = React.useCallback(() => {
    if (sending || hasActiveStream) {
      return;
    }
    const message = input.trim();
    const hasAttachments = attachments.length > 0;
    if (!message && !hasAttachments) {
      return;
    }
    if (needsUpgradePaywall) {
      dispatch(upgradePaywallActions.open());
      return;
    }
    const toSend = attachments.length > 0 ? [...attachments] : undefined;
    setInput("");
    setAttachments([]);
    void dispatch(
      sendChatMessage({ request: gw.request, sessionKey, message, attachments: toSend })
    );
  }, [
    dispatch,
    gw.request,
    input,
    sessionKey,
    attachments,
    needsUpgradePaywall,
    sending,
    hasActiveStream,
  ]);

  const showArtifactPanel =
    artifact.filePath != null && viewportWidth >= ARTIFACT_PANEL_BREAKPOINT;

  React.useEffect(() => {
    if (!showArtifactPanel) {
      return;
    }
    const containerWidth = shellRef.current?.clientWidth ?? 0;
    const nextPanelWidth = clampArtifactPanelWidth(artifact.panelWidth, containerWidth);
    if (nextPanelWidth !== artifact.panelWidth) {
      artifact.setPanelWidth(nextPanelWidth);
    }
  }, [artifact.panelWidth, artifact.setPanelWidth, showArtifactPanel, viewportWidth]);

  return (
    <div ref={shellRef} className={ct.UiChatShellWithArtifact}>
      <div className={ct.UiChatShell}>
        <ChatMessageList
          displayMessages={
            displayMessages as React.ComponentProps<typeof ChatMessageList>["displayMessages"]
          }
          streamByRun={streamByRun}
          liveToolCalls={liveToolCalls}
          optimisticFirstMessage={optimisticFirstMessage}
          optimisticFirstAttachments={optimisticFirstAttachments}
          matchingFirstUserFromHistory={
            matchingFirstUserFromHistory as React.ComponentProps<
              typeof ChatMessageList
            >["matchingFirstUserFromHistory"]
          }
          waitingForFirstResponse={waitingForFirstResponse}
          markdownComponents={markdownComponents}
          scrollRef={scrollRef}
        />

        <div className={ct.UiChatScrollToBottomWrap}>
          <ScrollToBottomButton
            scrollRef={scrollRef}
            onScroll={scrollToBottom}
            contentKey={displayMessages.length}
          />

          <ChatComposer
            ref={composerRef}
            value={input}
            onChange={setInput}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onSend={send}
            disabled={sending}
            onAttachmentsLimitError={(msg) => addToastError(msg)}
            isVoiceRecording={voiceConfig.voice.isRecording}
            isVoiceProcessing={voiceConfig.voice.isProcessing}
            onVoiceStart={voiceConfig.handleVoiceStart}
            onVoiceStop={voiceConfig.handleVoiceStop}
            voiceNotConfigured={voiceConfig.voiceConfigured === false}
            onNavigateVoiceSettings={voiceConfig.handleNavigateVoiceSettings}
            whisperDownload={voiceConfig.whisperDownload}
            onWhisperDownload={voiceConfig.handleWhisperDownload}
          />
        </div>
      </div>
      {showArtifactPanel ? <ArtifactDivider containerRef={shellRef} /> : null}
      {showArtifactPanel ? <ArtifactPanel /> : null}
    </div>
  );
}

export function ChatPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  return (
    <ArtifactProvider>
      <ChatPageContent state={state} />
    </ArtifactProvider>
  );
}
