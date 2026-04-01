import { stripMetadata } from "@ui/chat/hooks/messageParser";
import type { UiMessage, UiMessageAttachment, UiToolCall, UiToolResult } from "./chat-types";

export function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export function extractText(msg: unknown): string {
  try {
    if (!msg || typeof msg !== "object") {
      return typeof msg === "string" ? msg : "";
    }
    const m = msg as { content?: unknown; text?: unknown };
    if (typeof m.text === "string" && m.text.trim()) {
      return m.text;
    }
    const content = m.content;
    if (typeof content === "string") {
      return content.trim() ? content : "";
    }
    if (!Array.isArray(content)) {
      return "";
    }
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return "";
        }
        const part = p as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  } catch {
    return "";
  }
}

/** Extract attachment blocks from a history message for display (images as dataUrl, others as icon). */
export function extractAttachmentsFromMessage(msg: unknown): UiMessageAttachment[] {
  const out: UiMessageAttachment[] = [];
  try {
    if (!msg || typeof msg !== "object") {
      return out;
    }
    const m = msg as { content?: unknown };
    const content = m.content;
    if (!Array.isArray(content)) {
      return out;
    }
    for (const p of content) {
      if (!p || typeof p !== "object") {
        continue;
      }
      const part = p as {
        type?: unknown;
        text?: unknown;
        data?: unknown;
        mimeType?: unknown;
        source?: { type?: unknown; data?: unknown; media_type?: unknown };
      };
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "text") {
        continue;
      }
      let dataUrl: string | undefined;
      let mimeType: string | undefined;
      if (type === "image" && (typeof part.data === "string" || part.source)) {
        const data =
          typeof part.data === "string"
            ? part.data
            : typeof part.source?.data === "string"
              ? part.source.data
              : undefined;
        const mediaType =
          typeof part.mimeType === "string"
            ? part.mimeType
            : typeof part.source?.media_type === "string"
              ? part.source.media_type
              : "image/png";
        if (data) {
          dataUrl = `data:${mediaType};base64,${data}`;
          mimeType = mediaType;
        }
      }
      if (
        !dataUrl &&
        type === "audio" &&
        (typeof part.data === "string" || typeof part.source?.data === "string")
      ) {
        const data =
          typeof part.data === "string"
            ? part.data
            : typeof part.source?.data === "string"
              ? part.source.data
              : undefined;
        const mediaType =
          typeof part.mimeType === "string"
            ? part.mimeType
            : typeof part.source?.media_type === "string"
              ? part.source.media_type
              : "audio/mpeg";
        if (data) {
          dataUrl = `data:${mediaType};base64,${data}`;
          mimeType = mediaType;
        }
      }
      out.push({
        type: type || "file",
        mimeType: mimeType || (typeof part.mimeType === "string" ? part.mimeType : undefined),
        dataUrl,
      });
    }

    if (out.length === 0) {
      const details = (msg as { details?: unknown }).details;
      const derived = extractAttachmentsFromToolDetails(details);
      if (derived.length > 0) {
        out.push(...derived);
      }
    }
  } catch {
    // ignore
  }
  return out;
}

function inferAttachmentType(pathOrUrl: string): UiMessageAttachment["type"] {
  const mimeType = inferMimeTypeFromPath(pathOrUrl);
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

function inferMimeTypeFromPath(pathOrUrl: string): string {
  const normalized = pathOrUrl.split("?")[0]?.toLowerCase() ?? "";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".ogg") || normalized.endsWith(".opus")) return "audio/ogg";
  if (normalized.endsWith(".m4a")) return "audio/mp4";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function extractAttachmentsFromToolDetails(details: unknown): UiMessageAttachment[] {
  if (!details || typeof details !== "object") {
    return [];
  }

  const typed = details as {
    path?: unknown;
    paths?: unknown;
    media?: { mediaUrl?: unknown; mediaUrls?: unknown };
  };
  const rawPaths: string[] = [];

  if (typeof typed.path === "string" && typed.path.trim()) {
    rawPaths.push(typed.path);
  }

  if (Array.isArray(typed.paths)) {
    for (const candidate of typed.paths) {
      if (typeof candidate === "string" && candidate.trim()) {
        rawPaths.push(candidate);
      }
    }
  }

  if (typeof typed.media?.mediaUrl === "string" && typed.media.mediaUrl.trim()) {
    rawPaths.push(typed.media.mediaUrl);
  }

  const mediaUrls = typed.media?.mediaUrls;
  if (Array.isArray(mediaUrls)) {
    for (const candidate of mediaUrls) {
      if (typeof candidate === "string" && candidate.trim()) {
        rawPaths.push(candidate);
      }
    }
  }

  const uniquePaths = [...new Set(rawPaths)];
  return uniquePaths.map((filePath) => {
    const mimeType = inferMimeTypeFromPath(filePath);
    return {
      type: inferAttachmentType(filePath),
      mimeType,
      filePath,
    };
  });
}

const HEARTBEAT_PROMPT_PREFIX = "Read HEARTBEAT.md if it exists (workspace context).";
const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

/** Messages auto-sent after exec approval that should be hidden from the UI. */
const APPROVAL_CONTINUE_TOKENS = new Set(["continue", "denied"]);

/** Detect auto-continue messages sent after exec approval (single-word message). */
export function isApprovalContinueMessage(role: string, text: string): boolean {
  if (role !== "user") {
    return false;
  }
  const trimmed = text.trim().toLowerCase();
  return !trimmed.includes(" ") && APPROVAL_CONTINUE_TOKENS.has(trimmed);
}

/** Detect heartbeat-related messages that should be hidden from the chat UI. */
export function isHeartbeatMessage(role: string, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // User-side: the heartbeat prompt injected by the gateway.
  // Use includes() because gateway may prepend metadata (date headers, etc.).
  if (role === "user" && trimmed.includes(HEARTBEAT_PROMPT_PREFIX)) {
    return true;
  }
  // Assistant-side: HEARTBEAT_OK acknowledgment (possibly with light markup or surrounding text)
  if (role === "assistant") {
    const stripped = trimmed
      .replace(/<[^>]*>/g, " ")
      .replace(/[*`~_]+/g, "")
      .trim();
    if (stripped === HEARTBEAT_OK_TOKEN || stripped.includes(HEARTBEAT_OK_TOKEN)) {
      return true;
    }
  }
  return false;
}

export function parseRole(value: unknown): UiMessage["role"] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "user" || raw === "assistant" || raw === "system") {
    return raw;
  }
  return "unknown";
}

/** Extract tool calls from an assistant message's content array. */
export function extractToolCalls(msg: unknown): UiToolCall[] {
  const out: UiToolCall[] = [];
  if (!msg || typeof msg !== "object") {
    return out;
  }
  const m = msg as { content?: unknown };
  if (!Array.isArray(m.content)) {
    return out;
  }
  for (const part of m.content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const p = part as { type?: string; id?: string; name?: string; arguments?: unknown };
    const t = typeof p.type === "string" ? p.type.toLowerCase() : "";
    if (
      (t === "toolcall" || t === "tool_call" || t === "tooluse" || t === "tool_use") &&
      typeof p.name === "string"
    ) {
      out.push({
        id: typeof p.id === "string" ? p.id : `tc-${out.length}`,
        name: p.name,
        arguments:
          p.arguments && typeof p.arguments === "object"
            ? (p.arguments as Record<string, unknown>)
            : {},
      });
    }
  }
  return out;
}

/** Extract tool result info from a toolResult-role message. */
export function extractToolResult(msg: unknown): UiToolResult | null {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  const m = msg as {
    role?: string;
    toolCallId?: string;
    toolName?: string;
    content?: unknown;
    details?: { status?: string; audioPath?: string };
  };
  const role = typeof m.role === "string" ? m.role : "";
  if (role !== "toolResult" && role !== "tool_result") {
    return null;
  }
  const text = extractText(msg);
  const attachments = extractAttachmentsFromMessage(msg);
  return {
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : "",
    toolName: typeof m.toolName === "string" ? m.toolName : "unknown",
    text,
    status: typeof m.details?.status === "string" ? m.details.status : undefined,
    audioPath: typeof m.details?.audioPath === "string" ? m.details.audioPath : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function parseHistoryMessages(raw: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const msg = item as {
      role?: unknown;
      timestamp?: unknown;
      usage?: Record<string, number>;
      model?: unknown;
      cost?: Record<string, number>;
    };
    const rawRole = typeof msg.role === "string" ? msg.role : "";

    // Handle toolResult messages: attach results to the preceding assistant message.
    if (rawRole === "toolResult" || rawRole === "tool_result") {
      const result = extractToolResult(item);
      if (result && out.length > 0) {
        const prev = out[out.length - 1];
        if (prev.role === "assistant") {
          prev.toolResults = [...(prev.toolResults ?? []), result];
        }
      }
      continue;
    }

    const role = parseRole(msg.role);
    const text = extractText(item);
    const toolCalls = role === "assistant" ? extractToolCalls(item) : [];
    const attachments = extractAttachmentsFromMessage(item);
    const hasAttachments = attachments.length > 0;
    const hasToolCalls = toolCalls.length > 0;
    if (!text && !hasAttachments && !hasToolCalls) {
      continue;
    }
    // Hide heartbeat prompts and ack responses from chat history
    if (text && isHeartbeatMessage(role, text)) {
      continue;
    }
    // Strip gateway-injected metadata so the UI shows only the actual message content.
    const displayText = text ? stripMetadata(text).trim() : "";
    if (role === "assistant" && displayText === "NO_REPLY") {
      continue;
    }
    const ts =
      typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
        ? Math.floor(msg.timestamp)
        : undefined;
    // Extract usage and model from assistant messages
    const rawUsage = msg.usage;
    const messageUsage =
      role === "assistant" && rawUsage
        ? {
            input: rawUsage.input ?? rawUsage.inputTokens ?? 0,
            output: rawUsage.output ?? rawUsage.outputTokens ?? 0,
            cacheRead: rawUsage.cacheRead ?? rawUsage.cache_read_input_tokens ?? 0,
            cacheWrite: rawUsage.cacheWrite ?? rawUsage.cache_creation_input_tokens ?? 0,
          }
        : undefined;
    const messageModel =
      role === "assistant" && typeof msg.model === "string" && msg.model !== "gateway-injected"
        ? msg.model
        : undefined;

    out.push({
      id: `h-${ts ?? 0}-${i}`,
      role,
      text: displayText,
      ts,
      attachments: hasAttachments ? attachments : undefined,
      toolCalls: hasToolCalls ? toolCalls : undefined,
      usage: messageUsage,
      model: messageModel,
    });
  }
  return out;
}
