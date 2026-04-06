// @vitest-environment jsdom
import React from "react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { store } from "@store/store";
import { ChatMessageList } from "./ChatMessageList";
import { ArtifactProvider } from "../context/ArtifactContext";

describe("ChatMessageList audio tool results", () => {
  it("renders inline audio player for historical tts tool results", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <ArtifactProvider>
        <ChatMessageList
          displayMessages={[
            {
              id: "assistant-1",
              role: "assistant",
              text: "",
              toolCalls: [
                {
                  id: "toolu_01BLSyn2dv9HAyV4A8pEf2wZ",
                  name: "tts",
                  arguments: { text: "Resumo da vida" },
                },
              ],
              toolResults: [
                {
                  toolCallId: "toolu_01BLSyn2dv9HAyV4A8pEf2wZ",
                  toolName: "tts",
                  text: "Generated audio reply.",
                  audioPath: "/tmp/openclaw/tts-KnspHS/voice-1775001059725.mp3",
                },
              ],
            },
          ]}
          streamByRun={{}}
          liveToolCalls={[]}
          optimisticFirstMessage={null}
          optimisticFirstAttachments={null}
          matchingFirstUserFromHistory={null}
          waitingForFirstResponse={false}
          markdownComponents={{}}
          scrollRef={scrollRef}
        />
      </ArtifactProvider>
    );

    await waitFor(() => {
      const audio = container.querySelector("audio");
      expect(audio).not.toBeNull();
      expect(audio?.getAttribute("src")).toBe(
        `data:application/octet-stream;base64,${btoa("/tmp/openclaw/tts-KnspHS/voice-1775001059725.mp3")}`
      );
    });
  });

  it("renders tts audio after assistant text so voice reply closes the turn", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[
              {
                id: "assistant-voice-last",
                role: "assistant",
                text: "Aqui vai o resumo em texto.",
                toolCalls: [
                  {
                    id: "toolu_01VoiceLast",
                    name: "tts",
                    arguments: { text: "Aqui vai o resumo em texto." },
                  },
                ],
                toolResults: [
                  {
                    toolCallId: "toolu_01VoiceLast",
                    toolName: "tts",
                    text: "Generated audio reply.",
                    audioPath: "/tmp/openclaw/tts-last/voice.mp3",
                  },
                ],
              },
            ]}
            streamByRun={{}}
            liveToolCalls={[]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            markdownComponents={{}}
            scrollRef={scrollRef}
          />
        </ArtifactProvider>
      </Provider>
    );

    await waitFor(() => {
      const audio = container.querySelector("audio");
      expect(audio).not.toBeNull();
    });

    const textBlock = container.querySelector(".UiChatText");
    const audio = container.querySelector("audio");
    expect(textBlock).not.toBeNull();
    expect(audio).not.toBeNull();
    expect(
      textBlock!.compareDocumentPosition(audio!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders historical generated images from tool result file paths", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <ArtifactProvider>
        <ChatMessageList
          displayMessages={[
            {
              id: "assistant-1",
              role: "assistant",
              text: "",
              toolCalls: [
                {
                  id: "toolu_01EKMw78h7L1aUu6suMPcMmc",
                  name: "image_generate",
                  arguments: { prompt: "world in 2029" },
                },
              ],
              toolResults: [
                {
                  toolCallId: "toolu_01EKMw78h7L1aUu6suMPcMmc",
                  toolName: "image_generate",
                  text: "Generated 1 image with openai/gpt-image-1.",
                  attachments: [
                    {
                      type: "image",
                      mimeType: "image/png",
                      filePath:
                        "/Users/test/Library/Application Support/openspace-desktop/openclaw/media/tool-image-generation/image-1---8e376867-b20a-494c-8b12-ada5ebb3d5e1.png",
                    },
                  ],
                },
              ],
            },
          ]}
          streamByRun={{}}
          liveToolCalls={[]}
          optimisticFirstMessage={null}
          optimisticFirstAttachments={null}
          matchingFirstUserFromHistory={null}
          waitingForFirstResponse={false}
          markdownComponents={{}}
          scrollRef={scrollRef}
        />
      </ArtifactProvider>
    );

    await waitFor(() => {
      const image = container.querySelector("img");
      expect(image).not.toBeNull();
      expect(image?.getAttribute("src")).toBe(
        `data:application/octet-stream;base64,${btoa("/Users/test/Library/Application Support/openspace-desktop/openclaw/media/tool-image-generation/image-1---8e376867-b20a-494c-8b12-ada5ebb3d5e1.png")}`
      );
    });
  });

  it("hides plain assistant text when voice mode is active and the turn has tts", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[
              {
                id: "assistant-voice-hidden",
                role: "assistant",
                text: "Resumo curto em linguagem natural.",
                toolCalls: [
                  {
                    id: "toolu_01VoiceOnly",
                    name: "tts",
                    arguments: { text: "Resumo curto em linguagem natural." },
                  },
                ],
                toolResults: [
                  {
                    toolCallId: "toolu_01VoiceOnly",
                    toolName: "tts",
                    text: "Generated audio reply.",
                    audioPath: "/tmp/openclaw/tts-hidden/voice.mp3",
                  },
                ],
              },
            ]}
            streamByRun={{}}
            liveToolCalls={[]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            markdownComponents={{}}
            scrollRef={scrollRef}
            voiceReplyMode
          />
        </ArtifactProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toBeNull();
    });

    expect(container.querySelector(".UiChatText")).toBeNull();
    expect(container.textContent).not.toContain("Resumo curto em linguagem natural.");
  });

  it("keeps structured assistant text visible in voice mode when the turn has tts", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:application/octet-stream;base64,${btoa(filePath)}`,
          mimeType: "application/octet-stream",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[
              {
                id: "assistant-voice-structured",
                role: "assistant",
                text: "Acesse https://anthropic.com/security para os detalhes.",
                toolCalls: [
                  {
                    id: "toolu_01VoiceStructured",
                    name: "tts",
                    arguments: { text: "Acesse https://anthropic.com/security para os detalhes." },
                  },
                ],
                toolResults: [
                  {
                    toolCallId: "toolu_01VoiceStructured",
                    toolName: "tts",
                    text: "Generated audio reply.",
                    audioPath: "/tmp/openclaw/tts-structured/voice.mp3",
                  },
                ],
              },
            ]}
            streamByRun={{}}
            liveToolCalls={[]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            markdownComponents={{}}
            scrollRef={scrollRef}
          />
        </ArtifactProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toBeNull();
    });

    expect(container.querySelector(".UiChatText")).not.toBeNull();
    expect(container.textContent).toContain("https://anthropic.com/security");
  });

  it("renders live audio player for in-flight tts tool results", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:audio/mpeg;base64,${btoa(filePath)}`,
          mimeType: "audio/mpeg",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[]}
            streamByRun={{}}
            liveToolCalls={[
              {
                toolCallId: "toolu_live_tts",
                runId: "run-live-tts",
                name: "tts",
                arguments: { text: "Resposta falada" },
                phase: "result",
                audioPath: "/tmp/openclaw/tts-live/voice.mp3",
              },
            ]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            markdownComponents={{}}
            scrollRef={scrollRef}
          />
        </ArtifactProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toBeNull();
    });

    expect(container.textContent).not.toContain("Text to speech");
  });

  it("matches tts tool results by toolCallId so audio stays outside unrelated action log cards", async () => {
    Object.defineProperty(window, "openclawDesktop", {
      value: {
        readFileDataUrl: vi.fn(async (filePath: string) => ({
          dataUrl: `data:audio/mpeg;base64,${btoa(filePath)}`,
          mimeType: "audio/mpeg",
        })),
        openExternal: vi.fn(async () => {}),
      } as unknown as NonNullable<Window["openclawDesktop"]>,
      writable: true,
      configurable: true,
    });
    const scrollRef = { current: document.createElement("div") } as React.RefObject<HTMLDivElement>;
    const { container } = render(
      <Provider store={store}>
        <ArtifactProvider>
          <ChatMessageList
            displayMessages={[
              {
                id: "assistant-mixed-tools",
                role: "assistant",
                text: "Vou reiniciar já com PT.NO",
                toolCalls: [
                  {
                    id: "toolu_read",
                    name: "read",
                    arguments: { path: "/tmp/config.md" },
                  },
                  {
                    id: "toolu_exec",
                    name: "exec",
                    arguments: { cmd: "npm start" },
                  },
                  {
                    id: "toolu_tts",
                    name: "tts",
                    arguments: { text: "Vou reiniciar já com PT.NO" },
                  },
                ],
                toolResults: [
                  {
                    toolCallId: "toolu_tts",
                    toolName: "tts",
                    text: "Generated audio reply.",
                    audioPath: "/tmp/openclaw/tts-mixed/voice-mixed.mp3",
                  },
                ],
              },
            ]}
            streamByRun={{}}
            liveToolCalls={[]}
            optimisticFirstMessage={null}
            optimisticFirstAttachments={null}
            matchingFirstUserFromHistory={null}
            waitingForFirstResponse={false}
            markdownComponents={{}}
            scrollRef={scrollRef}
            voiceReplyMode
          />
        </ArtifactProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toBeNull();
    });

    expect(container.textContent).not.toContain("Text to speech");
    expect(container.textContent).toContain("Action Log");
  });
});
