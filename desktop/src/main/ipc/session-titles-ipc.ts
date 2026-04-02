import { ipcMain } from "electron";

import { IPC } from "../../shared/ipc-channels";
import type { SessionTitleSeed } from "../../shared/session-titles-contract";
import { ensureFriendlySessionTitles, readSessionTitlesStore } from "../session-titles/service";
import type { SessionTitlesHandlerParams } from "./types";

function isSessionTitleSeed(value: unknown): value is SessionTitleSeed {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return typeof (value as { sessionKey?: unknown }).sessionKey === "string";
}

export function registerSessionTitlesHandlers({ stateDir }: SessionTitlesHandlerParams): void {
  ipcMain.handle(IPC.sessionTitlesList, async () => {
    return { titles: readSessionTitlesStore(stateDir).titles } as const;
  });

  ipcMain.handle(
    IPC.sessionTitlesEnsure,
    async (_evt, payload: { sessions?: unknown }) => {
      const sessions = Array.isArray(payload?.sessions)
        ? payload.sessions.filter(isSessionTitleSeed)
        : [];
      const titles = await ensureFriendlySessionTitles({
        stateDir,
        sessions,
      });
      return { titles } as const;
    }
  );
}
