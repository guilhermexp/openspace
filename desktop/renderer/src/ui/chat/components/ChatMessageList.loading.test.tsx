// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@store/store";
import { ArtifactProvider } from "../context/ArtifactContext";
import { ChatMessageList } from "./ChatMessageList";

describe("ChatMessageList loading state", () => {
  it("shows a loading state while the selected session history is still loading", () => {
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;

    render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[]}
            streamByRun={{}}
            liveToolCalls={[]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            historyLoading={true}
            markdownComponents={{}}
            scrollRef={scrollRef}
          />
        </ArtifactProvider>
      </Provider>
    );

    expect(screen.getByText("Loading conversation...")).toBeTruthy();
  });
});
