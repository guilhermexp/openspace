import { useAppSelector } from "@store/hooks";
import type { UiMessageUsage } from "@store/slices/chat/chat-types";
import mm from "./MessageMeta.module.css";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtModel(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

/** Known context window sizes by model pattern. */
function resolveContextWindow(model: string): number {
  const short = fmtModel(model).toLowerCase();
  if (short.includes("opus")) return 1_000_000;
  if (short.includes("sonnet")) return 680_000;
  if (short.includes("haiku")) return 200_000;
  if (short.includes("gpt-4o")) return 128_000;
  if (short.includes("gpt-4")) return 128_000;
  if (short.includes("o1") || short.includes("o3") || short.includes("o4")) return 200_000;
  if (short.includes("gemini")) return 1_000_000;
  if (short.includes("deepseek")) return 128_000;
  return 200_000; // conservative default
}

function fmtTime(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Inline metadata footer below an assistant message, matching the Control UI style:
 * `OpenSpace  12:37  ↑1  ↓265  R26k  W212  0% ctx  claude-opus-4-6`
 */
export function MessageMeta({
  ts,
  usage,
  model: messageModel,
}: {
  ts?: number;
  usage?: UiMessageUsage;
  model?: string;
}) {
  const configModel = useAppSelector(
    (s) => s.config.snap?.config?.agents?.defaults?.model?.primary
  );

  const model = messageModel ?? configModel ?? null;

  if (!model && !usage) {
    return null;
  }

  const input = usage?.input ?? 0;
  const output = usage?.output ?? 0;
  const cacheRead = usage?.cacheRead ?? 0;
  const cacheWrite = usage?.cacheWrite ?? 0;
  const totalContextTokens = input + output + cacheRead + cacheWrite;
  const hasUsage = totalContextTokens > 0;

  const contextWindow = model ? resolveContextWindow(model) : 0;
  const ctxPercent =
    contextWindow > 0 && totalContextTokens > 0
      ? Math.min(Math.round((totalContextTokens / contextWindow) * 100), 100)
      : null;
  const ctxClass =
    ctxPercent !== null && ctxPercent >= 90
      ? `${mm.MessageMeta__ctx} ${mm["MessageMeta__ctx--danger"]}`
      : ctxPercent !== null && ctxPercent >= 75
        ? `${mm.MessageMeta__ctx} ${mm["MessageMeta__ctx--warn"]}`
        : mm.MessageMeta__ctx;

  return (
    <div className={mm.MessageMeta}>
      <span className={mm.MessageMeta__agent}>OpenSpace</span>
      <span className={mm.MessageMeta__time}>{fmtTime(ts)}</span>
      {hasUsage && (
        <>
          <span className={mm.MessageMeta__tokens}>↑{fmtTokens(input)}</span>
          <span className={mm.MessageMeta__tokens}>↓{fmtTokens(output)}</span>
          {cacheRead > 0 && <span className={mm.MessageMeta__cache}>R{fmtTokens(cacheRead)}</span>}
          {cacheWrite > 0 && (
            <span className={mm.MessageMeta__cache}>W{fmtTokens(cacheWrite)}</span>
          )}
          {ctxPercent !== null && <span className={ctxClass}>{ctxPercent}% ctx</span>}
        </>
      )}
      {model && <span className={mm.MessageMeta__model}>{fmtModel(model)}</span>}
    </div>
  );
}
