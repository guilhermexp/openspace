import { useEffect, useRef, useState } from "react";
import type {
  UiToolCall,
  UiToolResult,
  LiveToolCall,
  UiMessageAttachment,
} from "@store/slices/chat/chatSlice";
import { MicrophoneIcon } from "@shared/kit/icons";
import { ChatAttachmentCard, getFileTypeLabel } from "./ChatAttachmentCard";
import { useArtifact } from "../context/ArtifactContext";
import { useInlineMediaSrc } from "./inline-media";
import s from "./ToolCallCard.module.css";

/** Tool names that should be hidden from the chat UI. */
export const HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set(["process"]);

/** Human-readable labels for known tool names. */
const TOOL_LABELS: Record<string, string> = {
  exec: "Run command",
  read: "Read file",
  write: "Write file",
  search: "Search",
  browser: "Browser",
  tts: "Text to speech",
};

/** Human-readable label for a tool name (for ActionLog title, etc.). */
export function getToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Extract all tool arguments as displayable key-value entries. */
function getArgEntries(args: Record<string, unknown>): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(args)) {
    if (val === undefined || val === null) continue;
    const str = typeof val === "string" ? val : JSON.stringify(val);
    entries.push({ key, value: str });
  }
  return entries;
}

function getPrimaryArtifactArgument(toolCall: UiToolCall): { key: string; value: string } | null {
  if (toolCall.name !== "read" && toolCall.name !== "write") {
    return null;
  }

  const priorityKeys = ["path", "file"];
  for (const key of priorityKeys) {
    const value = toolCall.arguments[key];
    if (typeof value === "string" && value.trim()) {
      return { key, value };
    }
  }

  for (const [key, value] of Object.entries(toolCall.arguments)) {
    if (typeof value === "string" && value.trim()) {
      return { key, value };
    }
  }

  return null;
}

/** Render images and file attachments from a tool result. */
function ToolResultAttachments({
  attachments,
  voiceReplyMode = false,
  showVoiceReplyToggle = false,
  onVoiceReplyModeToggle,
}: {
  attachments: UiMessageAttachment[];
  voiceReplyMode?: boolean;
  showVoiceReplyToggle?: boolean;
  onVoiceReplyModeToggle?: (next: boolean) => void;
}) {
  const images = attachments.filter(
    (a) => (a.dataUrl || a.filePath) && a.mimeType?.startsWith("image/")
  );
  const audio = attachments.filter((a) => a.mimeType?.startsWith("audio/"));
  const files = attachments.filter(
    (a) =>
      !((a.dataUrl || a.filePath) && a.mimeType?.startsWith("image/")) &&
      !a.mimeType?.startsWith("audio/")
  );

  return (
    <div className={s.ToolCallAttachments}>
      {images.map((att, idx) => (
        <div key={`img-${idx}`} className={s.ToolCallAttachmentImage}>
          <InlineImage attachment={att} />
        </div>
      ))}
      {audio.map((att, idx) => (
        <AudioPlayer
          key={`audio-${idx}`}
          src={att.dataUrl}
          audioPath={att.filePath}
          title={getFileTypeLabel(att.mimeType ?? "audio/mpeg")}
          voiceReplyMode={voiceReplyMode}
          showVoiceReplyToggle={showVoiceReplyToggle}
          onVoiceReplyModeToggle={onVoiceReplyModeToggle}
        />
      ))}
      {files.map((att, idx) => {
        const mimeType = att.mimeType ?? "application/octet-stream";
        return (
          <ChatAttachmentCard
            key={`file-${idx}`}
            fileName={getFileTypeLabel(mimeType)}
            mimeType={mimeType}
          />
        );
      })}
    </div>
  );
}

function getAudioLabel(src?: string, audioPath?: string): string {
  const raw = audioPath ?? src;
  if (!raw) {
    return "Generated audio";
  }
  const withoutProtocol = raw.replace(/^file:\/\//, "");
  const parts = withoutProtocol.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "Generated audio";
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  audioPath,
  title,
  voiceReplyMode = false,
  showVoiceReplyToggle = false,
  onVoiceReplyModeToggle,
}: {
  src?: string;
  audioPath?: string;
  title?: string;
  voiceReplyMode?: boolean;
  showVoiceReplyToggle?: boolean;
  onVoiceReplyModeToggle?: (next: boolean) => void;
}) {
  const { src: bridgedSrc, error: bridgeError } = useInlineMediaSrc({
    dataUrl: src,
    filePath: audioPath,
  });
  const resolvedSrc = bridgedSrc;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(resolvedSrc));
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(Boolean(resolvedSrc));
    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setError(bridgeError);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [bridgeError, resolvedSrc]);

  if (!resolvedSrc) {
    return null;
  }

  const displayTitle = title ?? getAudioLabel(src, audioPath);
  const statusText = isLoading
    ? "Preparing audio"
    : isPlaying
      ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
      : duration > 0
        ? `${formatAudioTime(duration)} ready`
        : "Voice reply";

  const handleTogglePlayback = async () => {
    if (!audioRef.current) {
      return;
    }
    if (audioRef.current.paused) {
      setError(null);
      try {
        await audioRef.current.play();
      } catch {
        setError("Unable to play audio.");
      }
      return;
    }
    audioRef.current.pause();
  };

  return (
    <div className={s.AudioPlayer}>
      <div className={s.AudioCapsule}>
        {showVoiceReplyToggle ? (
          <button
            type="button"
            className={`${s.AudioModeButton} ${voiceReplyMode ? s.AudioModeButtonActive : ""}`}
            aria-label={voiceReplyMode ? "Disable voice replies" : "Continue conversation by voice"}
            title={voiceReplyMode ? "Disable voice replies" : "Continue conversation by voice"}
            onClick={() => onVoiceReplyModeToggle?.(!voiceReplyMode)}
          >
            <MicrophoneIcon />
          </button>
        ) : null}

        <div className={s.AudioPlayerMeta}>
          <span className={s.AudioPlayerEyebrow}>
            {voiceReplyMode && showVoiceReplyToggle ? "Voice mode on" : "Voice reply"}
          </span>
          <span className={s.AudioPlayerTitle}>{displayTitle}</span>
          <span className={s.AudioPlayerStatus}>{statusText}</span>
        </div>

        <button
          type="button"
          className={s.AudioPlayButton}
          onClick={() => void handleTogglePlayback()}
          aria-label={isPlaying ? "Pause voice reply" : "Play voice reply"}
          title={isPlaying ? "Pause voice reply" : "Play voice reply"}
        >
          {isPlaying ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <rect x="3" y="3" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="10" y="3" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M5 3.5L12 8L5 12.5V3.5Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
      <audio
        ref={audioRef}
        className={s.AudioPlayerElement}
        preload="metadata"
        src={resolvedSrc}
        aria-label={displayTitle}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setIsLoading(false);
        }}
        onCanPlay={() => setIsLoading(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsLoading(false);
          setIsPlaying(false);
          setError("Unable to load audio.");
        }}
      />
      {error ? <div className={s.AudioPlayerError}>{error}</div> : null}
    </div>
  );
}

function InlineImage({ attachment }: { attachment: UiMessageAttachment }) {
  const { src, error } = useInlineMediaSrc({
    dataUrl: attachment.dataUrl,
    filePath: attachment.filePath,
  });

  if (!src || error) {
    return null;
  }

  return <img src={src} alt="" className={s.ToolCallAttachmentImg} />;
}

function ToolCallCardBody({
  toolCall,
  result,
  voiceReplyMode = false,
  onVoiceReplyModeToggle,
}: {
  toolCall: UiToolCall;
  result?: UiToolResult;
  voiceReplyMode?: boolean;
  onVoiceReplyModeToggle?: (next: boolean) => void;
}) {
  const { openArtifact } = useArtifact();
  const argEntries = getArgEntries(toolCall.arguments).filter((entry) => {
    if (voiceReplyMode && toolCall.name === "tts" && entry.key === "text") {
      return false;
    }
    return true;
  });
  const primaryArtifactArgument = getPrimaryArtifactArgument(toolCall);
  const hasResult = Boolean(result?.text);
  const dedupedAttachments =
    result?.attachments?.filter((attachment) => {
      if (!result.audioPath || !attachment.filePath || !attachment.mimeType?.startsWith("audio/")) {
        return true;
      }
      return attachment.filePath !== result.audioPath;
    }) ?? [];
  const hasAttachments = dedupedAttachments.length > 0;

  useEffect(() => {
    if (!result) {
      return;
    }
    if (toolCall.name !== "tts" && toolCall.name !== "image_generate") {
      return;
    }
    if (import.meta.env.DEV) {
      console.log("[tool-call-card] media-capable result", {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        audioPath: result.audioPath,
        attachments: result.attachments,
        text: result.text,
      });
    }
  }, [result, toolCall.id, toolCall.name]);

  return (
    <div className={s.ToolCallBody}>
      {argEntries.map((entry) => (
        <div key={entry.key} className={s.ToolCallArgLine}>
          <span className={s.ToolCallArgKey}>{entry.key}:</span>{" "}
          {primaryArtifactArgument?.key === entry.key &&
          primaryArtifactArgument.value === entry.value ? (
            <button
              type="button"
              className={s.ToolCallArgValueButton}
              title={entry.value}
              onClick={() => void openArtifact(entry.value)}
            >
              {entry.value}
            </button>
          ) : (
            <span className={s.ToolCallArgValue}>{entry.value}</span>
          )}
        </div>
      ))}

      {hasResult ? <div className={s.ToolCallResultText}>{result!.text}</div> : null}

      {result?.audioPath ? (
        <AudioPlayer
          audioPath={result.audioPath}
          voiceReplyMode={voiceReplyMode}
          showVoiceReplyToggle={toolCall.name === "tts"}
          onVoiceReplyModeToggle={onVoiceReplyModeToggle}
        />
      ) : null}

      {result?.status ? (
        <div
          className={`${s.ToolCallStatusLine} ${
            ["approved", "completed"].includes(result.status)
              ? s["ToolCallStatusLine--approved"]
              : result.status === "denied"
                ? s["ToolCallStatusLine--denied"]
                : result.status === "approval-pending"
                  ? s["ToolCallStatusLine--pending"]
                  : ""
          }`}
        >
          <span className={s.ToolCallStatusIcon}>
            {["approved", "completed"].includes(result.status) && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M13.3333 4L6 11.3333L2.66667 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {result.status === "denied" && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {result.status === "approval-pending" && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle
                  cx="8"
                  cy="7.99984"
                  r="5.33333"
                  stroke="currentColor"
                  strokeWidth="1.33333"
                />
                <path
                  d="M7.99992 5.8667V8.00003L9.06658 9.0667"
                  stroke="currentColor"
                  strokeWidth="1.33333"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className={s.ToolCallStatusText}>
            {result.status === "approved" && "Approved"}
            {result.status === "denied" && "Denied"}
            {result.status === "approval-pending" && "Pending"}
            {result.status === "completed" && "Completed"}
          </span>
        </div>
      ) : null}

      {hasAttachments ? (
        <ToolResultAttachments
          attachments={dedupedAttachments}
          voiceReplyMode={voiceReplyMode}
          showVoiceReplyToggle={toolCall.name === "tts"}
          onVoiceReplyModeToggle={onVoiceReplyModeToggle}
        />
      ) : null}
    </div>
  );
}

/** Render a single tool call as an inline collapsible section. */
export function ToolCallCard({
  toolCall,
  result,
  voiceReplyMode = false,
  onVoiceReplyModeToggle,
}: {
  toolCall: UiToolCall;
  result?: UiToolResult;
  voiceReplyMode?: boolean;
  onVoiceReplyModeToggle?: (next: boolean) => void;
}) {
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name;

  return (
    <div className={s.ToolCallCard}>
      <div className={`${s.ToolCallHeader} ${s["ToolCallHeader--static"]}`} aria-hidden>
        <span className={s.ToolCallLabel}>{label}</span>
      </div>
      <ToolCallCardBody
        toolCall={toolCall}
        result={result}
        voiceReplyMode={voiceReplyMode}
        onVoiceReplyModeToggle={onVoiceReplyModeToggle}
      />
    </div>
  );
}

/** Render a list of tool calls (and optionally their results). */
export function ToolCallCards({
  toolCalls,
  toolResults,
}: {
  toolCalls: UiToolCall[];
  toolResults?: UiToolResult[];
}) {
  const visible = toolCalls.filter((tc) => !HIDDEN_TOOL_NAMES.has(tc.name));
  if (!visible.length) {
    return null;
  }
  const resultMap = new Map<string, UiToolResult>();
  for (const r of toolResults ?? []) {
    if (r.toolCallId) {
      resultMap.set(r.toolCallId, r);
    }
  }
  return (
    <div className={s.ToolCallCards}>
      {visible.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} result={resultMap.get(tc.id)} />
      ))}
    </div>
  );
}

/** Render a single live tool call card (real-time via agent events). */
export function LiveToolCallCardItem({ tc }: { tc: LiveToolCall }) {
  const label = getToolLabel(tc.name);
  const isRunning = tc.phase === "start" || tc.phase === "update";
  const hasResult = Boolean(tc.resultText);
  const argEntries = getArgEntries(tc.arguments);

  return (
    <div className={s.ToolCallCard}>
      <div className={s.ToolCallHeader} aria-hidden>
        <span className={s.ToolCallLabel}>{label}</span>
      </div>
      <div className={s.ToolCallBody}>
        {argEntries.map((entry) => (
          <div key={entry.key} className={s.ToolCallArgLine}>
            <span className={s.ToolCallArgKey}>{entry.key}:</span>{" "}
            <span className={s.ToolCallArgValue}>{entry.value}</span>
          </div>
        ))}

        {hasResult ? <div className={s.ToolCallResultText}>{tc.resultText}</div> : null}

        {isRunning ? (
          <div className={`${s.ToolCallStatusLine} ${s["ToolCallStatusLine--running"]}`}>
            <span className={s.ToolCallStatusIcon}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 10C22 10 19.995 7.26822 18.3662 5.63824C16.7373 4.00827 14.4864 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.1031 21 19.5649 18.2543 20.6482 14.5M22 10V4M22 10H16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={s.ToolCallStatusText + " AnimatedTitleLoader"}>Running</span>
          </div>
        ) : tc.isError ? (
          <div className={`${s.ToolCallStatusLine} ${s["ToolCallStatusLine--error"]}`}>
            <span className={s.ToolCallStatusIcon}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={s.ToolCallStatusText}>Error</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
