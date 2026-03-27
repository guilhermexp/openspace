import { useAppSelector } from "@store/hooks";

/** Returns true when the current chat session has live tool calls or is sending. */
export function useSessionActivity(): boolean {
  const sending = useAppSelector((s) => s.chat.sending);
  const liveToolCalls = useAppSelector((s) => s.chat.liveToolCalls);
  const hasLive = Object.keys(liveToolCalls).length > 0;
  return sending || hasLive;
}
