import React from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import type {
  UiMessageAttachment,
  UiToolCall,
  UiToolResult,
  LiveToolCall,
} from "@store/slices/chat/chatSlice";
import type { UiMessageUsage } from "@store/slices/chat/chat-types";
import { isHeartbeatMessage } from "@store/slices/chat/chatSlice";
import type { ChatAttachmentInput } from "@store/slices/chat/chatSlice";
import { CopyMessageButton } from "./CopyMessageButton";
import { UserMessageBubble } from "./UserMessageBubble";
import { AssistantStreamBubble, TypingIndicator } from "./AssistantStreamBubble";
import { HIDDEN_TOOL_NAMES, AudioPlayer } from "./ToolCallCard";
import { ActionLog } from "./ActionLog";
import { MessageMeta } from "./MessageMeta";
import { useActionLogCollapsedByDefault } from "@shared/hooks/useActionLogCollapsedByDefault";
import am from "./AssistantMessage.module.css";
import ct from "../ChatTranscript.module.css";
import tc from "./ToolCallCard.module.css";
import { useInlineMediaSrc } from "./inline-media";

/** Collect all image attachments from tool results for standalone display. */
function collectToolResultImages(toolResults: UiToolResult[] | undefined): UiMessageAttachment[] {
  if (!toolResults) return [];
  const images: UiMessageAttachment[] = [];
  for (const r of toolResults) {
    if (!r.attachments) continue;
    for (const att of r.attachments) {
      if ((att.dataUrl || att.filePath) && att.mimeType?.startsWith("image/")) {
        images.push(att);
      }
    }
  }
  return images;
}

/** Extract audio info from TTS tool results for standalone rendering outside ActionLog. */
function collectTtsAudio(
  ttsCards: { toolCall: UiToolCall; result?: UiToolResult }[]
): { audioPath: string; toolCallId: string; toolName: string }[] {
  const items: { audioPath: string; toolCallId: string; toolName: string }[] = [];
  for (const card of ttsCards) {
    if (card.result?.audioPath) {
      items.push({
        audioPath: card.result.audioPath,
        toolCallId: card.toolCall.id,
        toolName: card.toolCall.name,
      });
    }
  }
  return items;
}

function collectLiveTtsAudio(
  liveToolCalls: LiveToolCall[]
): { audioPath: string; toolCallId: string; toolName: string }[] {
  const items: { audioPath: string; toolCallId: string; toolName: string }[] = [];
  for (const call of liveToolCalls) {
    if (call.name !== "tts" || !call.audioPath) {
      continue;
    }
    items.push({
      audioPath: call.audioPath,
      toolCallId: call.toolCallId,
      toolName: call.name,
    });
  }
  return items;
}

function collectLiveActionLogCalls(liveToolCalls: LiveToolCall[]): LiveToolCall[] {
  return liveToolCalls.filter((call) => call.name !== "tts");
}

function splitTtsCards(cards: { toolCall: UiToolCall; result?: UiToolResult }[]) {
  const regularCards: { toolCall: UiToolCall; result?: UiToolResult }[] = [];
  const ttsCards: { toolCall: UiToolCall; result?: UiToolResult }[] = [];

  for (const card of cards) {
    if (card.toolCall.name === "tts") {
      ttsCards.push(card);
      continue;
    }
    regularCards.push(card);
  }

  return { regularCards, ttsCards };
}

function hasStructuredVoiceTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/(https?:\/\/|www\.)/i.test(trimmed)) {
    return true;
  }

  if (/```|`[^`]+`/.test(trimmed)) {
    return true;
  }

  if (/^\s*(\d+\.\s+|[-*]\s+)/m.test(trimmed)) {
    return true;
  }

  if (/^\s*(pnpm|npm|bun|git|cd|ls|cat|openclaw|curl|uv|python|node)\b/m.test(trimmed)) {
    return true;
  }

  if (/(^|\s)(~\/|\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]*)/.test(trimmed)) {
    return true;
  }

  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(trimmed)) {
    return true;
  }

  if (/^\s*\|.+\|\s*$/m.test(trimmed)) {
    return true;
  }

  return false;
}

function downloadDataUrl(dataUrl: string, mimeType: string) {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `image-${Date.now()}.${ext}`;
  a.click();
}

function downloadFilePath(filePath: string) {
  const api = window.openclawDesktop;
  if (!api?.openExternal) {
    return;
  }
  void api.openExternal(filePath.startsWith("file://") ? filePath : `file://${filePath}`);
}

/** Render images from tool results as standalone chat-level blocks. */
function ToolResultImageBlock({ images }: { images: UiMessageAttachment[] }) {
  if (images.length === 0) return null;
  return (
    <div className={tc.ToolResultImageBlock}>
      {images.map((att, idx) => (
        <div key={`tri-${idx}`} className={tc.ToolResultImageWrap}>
          <ResolvedToolImage attachment={att} />
          <button
            type="button"
            className={tc.ToolResultDownloadBtn}
            title="Download image"
            onClick={() => {
              if (att.dataUrl) {
                downloadDataUrl(att.dataUrl, att.mimeType ?? "image/png");
                return;
              }
              if (att.filePath) {
                downloadFilePath(att.filePath);
              }
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function ResolvedToolImage({ attachment }: { attachment: UiMessageAttachment }) {
  const { src, error } = useInlineMediaSrc({
    dataUrl: attachment.dataUrl,
    filePath: attachment.filePath,
  });

  if (!src || error) {
    return null;
  }

  return <img src={src} alt="" className={tc.ToolResultImg} />;
}

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts?: number;
  pending?: boolean;
  attachments?: UiMessageAttachment[];
  toolCalls?: UiToolCall[];
  toolResults?: UiToolResult[];
  usage?: UiMessageUsage;
  model?: string;
};

type StreamEntry = {
  id: string;
  role: string;
  text: string;
};

export function ChatMessageList(props: {
  displayMessages: DisplayMessage[];
  streamByRun: Record<string, StreamEntry>;
  liveToolCalls: LiveToolCall[];
  optimisticFirstMessage: string | null;
  optimisticFirstAttachments: ChatAttachmentInput[] | null;
  matchingFirstUserFromHistory: DisplayMessage | null;
  waitingForFirstResponse: boolean;
  historyLoading?: boolean;
  markdownComponents: Components;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  voiceReplyMode?: boolean;
  onVoiceReplyModeToggle?: (next: boolean) => void;
}) {
  const {
    displayMessages,
    streamByRun,
    liveToolCalls,
    optimisticFirstMessage,
    optimisticFirstAttachments,
    matchingFirstUserFromHistory,
    waitingForFirstResponse,
    historyLoading = false,
    markdownComponents,
    scrollRef,
    voiceReplyMode = false,
    onVoiceReplyModeToggle,
  } = props;
  const [actionLogCollapsedByDefault] = useActionLogCollapsedByDefault();

  /** Stable key for the first user message so React doesn't remount when switching from optimistic to history. */
  const getMessageKey = (m: DisplayMessage) =>
    (optimisticFirstMessage != null && m.id === "opt-first") ||
    (matchingFirstUserFromHistory != null && m.id === matchingFirstUserFromHistory.id)
      ? "first-user"
      : m.id;

  // Group consecutive tool-call-only assistant messages into single blocks.
  type RenderItem =
    | { kind: "user"; msg: DisplayMessage }
    | { kind: "assistant"; msg: DisplayMessage }
    | { kind: "tool-group"; msgs: DisplayMessage[] };

  const renderItems: RenderItem[] = [];
  for (const m of displayMessages) {
    if (m.role === "user") {
      renderItems.push({ kind: "user", msg: m });
      continue;
    }
    const isToolOnly = !m.text && m.toolCalls && m.toolCalls.length > 0;
    if (isToolOnly) {
      const prev = renderItems[renderItems.length - 1];
      if (prev?.kind === "tool-group") {
        prev.msgs.push(m);
      } else {
        renderItems.push({ kind: "tool-group", msgs: [m] });
      }
    } else {
      renderItems.push({ kind: "assistant", msg: m });
    }
  }

  const streamBubbles = Object.values(streamByRun).filter(
    (m) => !isHeartbeatMessage(m.role, m.text)
  );
  const liveActionLogCalls = collectLiveActionLogCalls(liveToolCalls);
  const hasStreamBubbles = streamBubbles.length > 0;
  const showHistoryLoading =
    historyLoading &&
    renderItems.length === 0 &&
    !hasStreamBubbles &&
    liveToolCalls.length === 0 &&
    !waitingForFirstResponse;
  const lastAssistantRenderIndex =
    renderItems.length > 0
      ? [...renderItems]
          .reverse()
          .findIndex((i) => i.kind === "assistant" || i.kind === "tool-group")
      : -1;
  const lastAssistantFromRenderItems =
    lastAssistantRenderIndex >= 0 ? renderItems.length - 1 - lastAssistantRenderIndex : -1;

  return (
    <div className={ct.UiChatTranscript + " scrollable"} ref={scrollRef}>
      <div className={ct.UiChatTranscriptInner}>
        {showHistoryLoading ? (
          <div className={ct.UiChatHistoryLoading}>Loading conversation...</div>
        ) : null}
        {renderItems.map((item, index) => {
          if (item.kind === "user") {
            const m = item.msg;
            const attachmentsToShow: UiMessageAttachment[] =
              m.id === "opt-first" && optimisticFirstAttachments?.length
                ? optimisticFirstAttachments.map((att) => ({
                    type: att.mimeType?.startsWith("image/") ? "image" : "file",
                    mimeType: att.mimeType,
                    dataUrl: att.dataUrl,
                  }))
                : (m.attachments ?? []);
            return (
              <UserMessageBubble
                key={getMessageKey(m)}
                id={m.id}
                text={m.text}
                pending={m.pending}
                attachments={attachmentsToShow}
                markdownComponents={markdownComponents}
              />
            );
          }

          if (item.kind === "tool-group") {
            const key = item.msgs.map((m) => getMessageKey(m)).join("+");
            const isLastAssistant =
              !hasStreamBubbles &&
              liveToolCalls.length === 0 &&
              !waitingForFirstResponse &&
              index === lastAssistantFromRenderItems;
            const resultMap = new Map<string, UiToolResult>();
            for (const m of item.msgs) {
              for (const r of m.toolResults ?? []) {
                if (r.toolCallId) resultMap.set(r.toolCallId, r);
              }
            }
            const flatCards: { toolCall: UiToolCall; result?: UiToolResult }[] = [];
            for (const m of item.msgs) {
              const list = (m.toolCalls ?? []).filter((tc) => !HIDDEN_TOOL_NAMES.has(tc.name));
              for (const tc of list) {
                flatCards.push({ toolCall: tc, result: resultMap.get(tc.id) });
              }
            }
            const { regularCards, ttsCards } = splitTtsCards(flatCards);

            const toolGroupImages = collectToolResultImages(
              item.msgs.flatMap((m) => m.toolResults ?? [])
            );

            return (
              <div
                key={key}
                className={`${ct.UiChatRow} ${ct.UiChatRowToolGroup} ${am["UiChatRow-assistant"]} ${isLastAssistant ? ct.UiChatRowLastAssistant : ""}`}
              >
                <div className={am["UiChatBubble-assistant"]}>
                  {regularCards.length > 0 ? (
                    <ActionLog
                      cards={regularCards}
                      voiceReplyMode={voiceReplyMode}
                      autoCollapse={voiceReplyMode}
                      defaultCollapsed={actionLogCollapsedByDefault}
                      onVoiceReplyModeToggle={onVoiceReplyModeToggle}
                    />
                  ) : null}
                  <ToolResultImageBlock images={toolGroupImages} />
                  {collectTtsAudio(ttsCards).map((tts) => (
                    <AudioPlayer
                      key={tts.toolCallId}
                      audioPath={tts.audioPath}
                      voiceReplyMode={voiceReplyMode}
                      showVoiceReplyToggle
                      onVoiceReplyModeToggle={onVoiceReplyModeToggle}
                    />
                  ))}
                </div>
              </div>
            );
          }

          // Assistant message with text (may also have tool calls)
          const m = item.msg;
          const isLastAssistant =
            !hasStreamBubbles &&
            liveToolCalls.length === 0 &&
            !waitingForFirstResponse &&
            index === lastAssistantFromRenderItems;

          const resultMap = new Map<string, UiToolResult>();
          for (const result of m.toolResults ?? []) {
            if (result.toolCallId) {
              resultMap.set(result.toolCallId, result);
            }
          }
          const flatCards: { toolCall: UiToolCall; result?: UiToolResult }[] =
            m.toolCalls?.map((toolCall) => ({
              toolCall,
              result: resultMap.get(toolCall.id),
            })) ?? [];
          const { regularCards, ttsCards } = splitTtsCards(flatCards);
          const shouldShowAssistantText = Boolean(
            m.text &&
            (!voiceReplyMode || ttsCards.length === 0 || hasStructuredVoiceTranscript(m.text))
          );

          const assistantImages = collectToolResultImages(m.toolResults);

          return (
            <div
              key={getMessageKey(m)}
              className={`${ct.UiChatRow} ${am["UiChatRow-assistant"]} ${isLastAssistant ? ct.UiChatRowLastAssistant : ""}`}
            >
              <div className={am["UiChatBubble-assistant"]}>
                {regularCards.length > 0 ? (
                  <ActionLog
                    cards={regularCards}
                    voiceReplyMode={voiceReplyMode}
                    autoCollapse={voiceReplyMode}
                    defaultCollapsed={actionLogCollapsedByDefault}
                    onVoiceReplyModeToggle={onVoiceReplyModeToggle}
                  />
                ) : null}

                {shouldShowAssistantText ? (
                  <div className="UiChatText UiMarkdown">
                    <Markdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={markdownComponents}
                    >
                      {m.text}
                    </Markdown>
                  </div>
                ) : null}

                {shouldShowAssistantText ? (
                  <div className={am.UiChatMessageActions}>
                    <CopyMessageButton text={m.text} />
                  </div>
                ) : null}
                <MessageMeta ts={m.ts} usage={m.usage} model={m.model} />
                <ToolResultImageBlock images={assistantImages} />
                {collectTtsAudio(ttsCards).map((tts) => (
                  <AudioPlayer
                    key={tts.toolCallId}
                    audioPath={tts.audioPath}
                    voiceReplyMode={voiceReplyMode}
                    showVoiceReplyToggle
                    onVoiceReplyModeToggle={onVoiceReplyModeToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {waitingForFirstResponse ? (
          <TypingIndicator
            classNameRoot={
              !hasStreamBubbles && liveToolCalls.length === 0
                ? ct.UiChatRowLastAssistant
                : undefined
            }
          />
        ) : null}

        {liveToolCalls.length > 0 ? (
          <div
            className={`${ct.UiChatRow} ${am["UiChatRow-assistant"]} ${!hasStreamBubbles ? ct.UiChatRowLastAssistant : ""}`}
          >
            <div className={am["UiChatBubble-assistant"]}>
              {liveActionLogCalls.length > 0 ? (
                <ActionLog
                  liveToolCalls={liveActionLogCalls}
                  autoCollapse={voiceReplyMode}
                  defaultCollapsed={actionLogCollapsedByDefault}
                />
              ) : null}
              {collectLiveTtsAudio(liveToolCalls).map((tts) => (
                <AudioPlayer
                  key={tts.toolCallId}
                  audioPath={tts.audioPath}
                  voiceReplyMode={voiceReplyMode}
                  showVoiceReplyToggle
                  onVoiceReplyModeToggle={onVoiceReplyModeToggle}
                />
              ))}
            </div>
          </div>
        ) : null}

        {streamBubbles.map((m, i) => (
          <AssistantStreamBubble
            key={m.id}
            id={m.id}
            text={m.text}
            markdownComponents={markdownComponents}
            classNameRoot={i === streamBubbles.length - 1 ? ct.UiChatRowLastAssistant : undefined}
          />
        ))}
      </div>
    </div>
  );
}
