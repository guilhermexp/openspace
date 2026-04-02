import { useAppSelector } from "@store/hooks";

/** Returns a map of session keys that currently have an active run. */
export function useSessionActivity(): Record<string, boolean> {
  const runSessionKeyByRunId = useAppSelector((s) => s.chat.runSessionKeyByRunId);
  const busyBySession: Record<string, boolean> = {};

  for (const sessionKey of Object.values(runSessionKeyByRunId)) {
    busyBySession[sessionKey] = true;
  }

  return busyBySession;
}
