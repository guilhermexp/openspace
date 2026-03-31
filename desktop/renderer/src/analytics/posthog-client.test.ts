import { afterEach, describe, expect, it, vi } from "vitest";

const posthogInit = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: (...args: unknown[]) => posthogInit(...args),
    capture: vi.fn(),
    identify: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    __loaded: false,
    has_opted_out_capturing: vi.fn(() => false),
  },
}));

describe("posthog-client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not initialize PostHog in the renderer", async () => {
    const { initPosthogRenderer } = await import("./posthog-client");

    initPosthogRenderer("user-1", true);

    expect(posthogInit).not.toHaveBeenCalled();
  });
});
