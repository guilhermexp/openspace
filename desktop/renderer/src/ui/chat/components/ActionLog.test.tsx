// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActionLog } from "./ActionLog";

vi.mock("./ToolCallCard", () => ({
  ToolCallCard: ({ toolCall }: { toolCall: { name: string } }) => (
    <div data-testid="tool-call-card">{toolCall.name}</div>
  ),
  LiveToolCallCardItem: ({ tc }: { tc: { name: string } }) => (
    <div data-testid="live-tool-call-card">{tc.name}</div>
  ),
  getToolLabel: (name: string) => name,
  HIDDEN_TOOL_NAMES: new Set(),
}));

describe("ActionLog", () => {
  const cards = [
    {
      toolCall: {
        id: "tool-1",
        name: "search",
        arguments: {},
      },
    },
  ];

  it("starts expanded by default", () => {
    cleanup();
    render(<ActionLog cards={cards} />);

    expect(screen.getByRole("button", { name: /action log/i }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getByTestId("tool-call-card")).toBeTruthy();
  });

  it("starts collapsed when configured to be collapsed by default", () => {
    cleanup();
    render(<ActionLog cards={cards} defaultCollapsed />);

    const header = screen.getByRole("button", { name: /action log/i });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("tool-call-card")).toBeNull();
  });

  it("starts collapsed in voice mode and can be expanded manually", () => {
    cleanup();
    render(<ActionLog cards={cards} voiceReplyMode autoCollapse />);

    const header = screen.getByRole("button", { name: /action log/i });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("tool-call-card")).toBeNull();

    fireEvent.click(header);

    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("tool-call-card")).toBeTruthy();
  });

  it("collapses when voice mode is turned on", () => {
    cleanup();
    const { rerender } = render(<ActionLog cards={cards} autoCollapse={false} />);

    const header = screen.getByRole("button", { name: /action log/i });
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    rerender(<ActionLog cards={cards} voiceReplyMode autoCollapse />);

    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("tool-call-card")).toBeNull();
  });
});
