// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  UpdateAvailablePayload,
  UpdateDownloadedPayload,
  UpdateDownloadProgressPayload,
  UpdateErrorPayload,
} from "../../../../src/shared/desktop-bridge-contract";
import { UpdateBanner } from "./UpdateBanner";

type UpdateListeners = {
  available: Array<(payload: UpdateAvailablePayload) => void>;
  progress: Array<(payload: UpdateDownloadProgressPayload) => void>;
  downloaded: Array<(payload: UpdateDownloadedPayload) => void>;
  error: Array<(payload: UpdateErrorPayload) => void>;
};

const listeners: UpdateListeners = {
  available: [],
  progress: [],
  downloaded: [],
  error: [],
};

const mockDownloadUpdate = vi.fn(async () => undefined);
const mockInstallUpdate = vi.fn(async () => undefined);

function resetListeners() {
  listeners.available.length = 0;
  listeners.progress.length = 0;
  listeners.downloaded.length = 0;
  listeners.error.length = 0;
}

describe("UpdateBanner", () => {
  beforeEach(() => {
    cleanup();
    resetListeners();
    mockDownloadUpdate.mockClear();
    mockInstallUpdate.mockClear();
    (window as Record<string, unknown>).openclawDesktop = {
      downloadUpdate: mockDownloadUpdate,
      installUpdate: mockInstallUpdate,
      onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => {
        listeners.available.push(cb);
        return () => undefined;
      },
      onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => {
        listeners.progress.push(cb);
        return () => undefined;
      },
      onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => {
        listeners.downloaded.push(cb);
        return () => undefined;
      },
      onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => {
        listeners.error.push(cb);
        return () => undefined;
      },
    };
  });

  afterEach(() => {
    cleanup();
    resetListeners();
    delete (window as Record<string, unknown>).openclawDesktop;
  });

  it("shows an error if the download fails before the first progress event", () => {
    render(<UpdateBanner />);

    act(() => {
      listeners.available[0]?.({ version: "1.2.3" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);

    act(() => {
      listeners.error[0]?.({ message: "Network timeout" });
    });

    expect(screen.getByText("Update failed: Network timeout")).toBeTruthy();
  });

  it("shows an error while an update is already downloading", () => {
    render(<UpdateBanner />);

    act(() => {
      listeners.available[0]?.({ version: "1.2.3" });
      listeners.progress[0]?.({
        percent: 42,
        bytesPerSecond: 1024,
        transferred: 42,
        total: 100,
      });
    });

    act(() => {
      listeners.error[0]?.({ message: "Download interrupted" });
    });

    expect(screen.getByText("Update failed: Download interrupted")).toBeTruthy();
  });
});
