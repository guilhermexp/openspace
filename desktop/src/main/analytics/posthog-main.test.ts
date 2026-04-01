import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthogConstructor = vi.fn();

vi.mock("posthog-node", () => ({
  PostHog: function MockPostHog(...args: unknown[]) {
    posthogConstructor(...args);
    return {
      identify: vi.fn(),
      capture: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

describe("posthog-main", () => {
  const originalApiKey = process.env.POSTHOG_API_KEY;

  beforeEach(() => {
    process.env.POSTHOG_API_KEY = "phc_test_key";
  });

  afterEach(() => {
    process.env.POSTHOG_API_KEY = originalApiKey;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not initialize PostHog in the main process", async () => {
    const { initPosthogMain } = await import("./posthog-main");

    initPosthogMain("user-1", true);

    expect(posthogConstructor).not.toHaveBeenCalled();
  });
});
