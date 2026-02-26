/**
 * Auth token storage moved to renderer localStorage.
 * This file is kept as a no-op so register.ts doesn't need changes.
 */
import type { RegisterParams } from "./types";

export function registerAuthHandlers(_params: RegisterParams) {
  // JWT is now stored in renderer localStorage — no main-process IPC needed.
}
