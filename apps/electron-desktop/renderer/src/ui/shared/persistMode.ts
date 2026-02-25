/**
 * Persists the desktop.mode field to the gateway config file via RPC.
 * This ensures the mode survives across restarts and backup/restore cycles.
 */
import type { SetupMode } from "@store/slices/authSlice";

type ConfigSnapshot = {
  config: Record<string, unknown>;
  hash?: string;
  exists?: boolean;
};

export async function persistDesktopMode(
  gwRequest: <T>(method: string, params: Record<string, unknown>) => Promise<T>,
  mode: SetupMode
): Promise<void> {
  try {
    const snap = await gwRequest<ConfigSnapshot>("config.get", {});
    const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
      string,
      unknown
    >;
    const existing = (cfg.desktop && typeof cfg.desktop === "object" ? cfg.desktop : {}) as Record<
      string,
      unknown
    >;

    const patch = {
      desktop: {
        ...existing,
        mode,
      },
    };

    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) return;

    await gwRequest("config.patch", {
      baseHash,
      raw: JSON.stringify(patch, null, 2),
      note: `Set desktop.mode to "${mode}"`,
    });
  } catch (err) {
    console.warn("[persistDesktopMode] Failed:", err);
  }
}

/**
 * Reads the desktop.mode from gateway config.
 * Returns null if not set.
 */
export async function readDesktopMode(
  gwRequest: <T>(method: string, params: Record<string, unknown>) => Promise<T>
): Promise<SetupMode | null> {
  try {
    const snap = await gwRequest<ConfigSnapshot>("config.get", {});
    const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
      string,
      unknown
    >;
    const desktop = (cfg.desktop && typeof cfg.desktop === "object" ? cfg.desktop : {}) as Record<
      string,
      unknown
    >;
    if (desktop.mode === "paid" || desktop.mode === "self-managed") {
      return desktop.mode as SetupMode;
    }
    return null;
  } catch {
    return null;
  }
}
