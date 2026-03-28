import { useAppSelector } from "@store/hooks";

/** Returns true when the current chat session is sending, streaming, or running tools. */
export function useSessionActivity(): boolean {
  const sending = useAppSelector((s) => s.chat.sending);
  const liveToolCalls = useAppSelector((s) => s.chat.liveToolCalls);
  const streamByRun = useAppSelector((s) => s.chat.streamByRun);
  const hasLive = Object.keys(liveToolCalls).length > 0;
  const hasStream = Object.keys(streamByRun).length > 0;
  return sending || hasLive || hasStream;
}
