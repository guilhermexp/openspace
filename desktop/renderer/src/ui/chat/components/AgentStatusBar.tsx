import { useAppSelector } from "@store/hooks";
import sb from "./AgentStatusBar.module.css";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatModel(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

export function AgentStatusBar() {
  const {
    model: statusModel,
    inputTokens,
    outputTokens,
    contextWindow,
  } = useAppSelector((s) => s.agentStatus);
  const configModel = useAppSelector(
    (s) => s.config.snap?.config?.agents?.defaults?.model?.primary
  );

  const model = statusModel ?? configModel ?? null;

  if (!model) {
    return null;
  }

  const hasUsage = inputTokens > 0 || outputTokens > 0;
  const totalTokens = inputTokens + outputTokens;
  const ctxPercent = contextWindow > 0 ? Math.round((totalTokens / contextWindow) * 100) : 0;

  return (
    <div className={sb.AgentStatusBar}>
      {hasUsage && (
        <>
          <span className={sb.AgentStatusBar__stat}>↑{formatTokens(inputTokens)}</span>
          <span className={sb.AgentStatusBar__stat}>↓{formatTokens(outputTokens)}</span>
          <span className={sb.AgentStatusBar__stat}>{ctxPercent}% ctx</span>
        </>
      )}
      <span className={sb.AgentStatusBar__model}>{formatModel(model)}</span>
    </div>
  );
}
