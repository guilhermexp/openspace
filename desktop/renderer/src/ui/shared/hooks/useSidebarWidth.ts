import React from "react";

const SIDEBAR_WIDTH_KEY = "openclaw:sidebar-width";

export const SIDEBAR_DEFAULT_WIDTH = 220;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 360;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readPersistedSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) {
      return SIDEBAR_DEFAULT_WIDTH;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return SIDEBAR_DEFAULT_WIDTH;
    }

    return clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function useSidebarWidth(): [number, (next: number) => void] {
  const [width, setWidth] = React.useState(readPersistedSidebarWidth);

  const updateWidth = React.useCallback((next: number) => {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);

    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {
      // ignore persistence failures
    }
  }, []);

  return [width, updateWidth];
}
