// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@store/hooks", () => ({
  useAppSelector: (selector: (st: unknown) => unknown) =>
    selector({
      config: {
        snap: {
          config: {
            agents: {
              defaults: {
                model: {
                  primary: null,
                },
              },
            },
          },
        },
      },
    }),
}));

import { MessageMeta } from "./MessageMeta";

describe("MessageMeta", () => {
  it("counts cached tokens in the context percentage", () => {
    render(
      <MessageMeta
        ts={Date.UTC(2026, 2, 28, 10, 44, 0)}
        model="openai-codex/gpt-5.4"
        usage={{
          input: 885,
          output: 101,
          cacheRead: 15_000,
          cacheWrite: 0,
        }}
      />,
    );

    expect(screen.getByText("8% ctx")).not.toBeNull();
  });
});
