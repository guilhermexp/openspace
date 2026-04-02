import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { net } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureFriendlySessionTitles, readSessionTitlesStore } from "./service";

describe("session title service", () => {
  let tmpDir: string;
  let stateDir: string;
  let authProfilesPath: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "session-titles-test-"));
    stateDir = path.join(tmpDir, "state");
    authProfilesPath = path.join(stateDir, "agents", "main", "agent", "auth-profiles.json");
    await fsp.mkdir(path.dirname(authProfilesPath), { recursive: true });
    fs.writeFileSync(
      authProfilesPath,
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "openai:default": {
              type: "api_key",
              provider: "openai",
              key: "sk-test-openai",
            },
          },
          order: {
            openai: ["openai:default"],
          },
        },
        null,
        2
      )
    );
    vi.mocked(net.fetch).mockReset();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates and persists friendly titles locally", async () => {
    vi.mocked(net.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            titles: [{ sessionKey: "session-1", title: "Corrigir onboarding" }],
          }),
        }),
        { status: 200 }
      )
    );

    const titles = await ensureFriendlySessionTitles({
      stateDir,
      sessions: [
        {
          sessionKey: "session-1",
          derivedTitle: "follow up on onboarding error and retry gateway bootstrap",
          lastMessagePreview: "check if settings screen still fails after reconnect",
        },
      ],
    });

    expect(titles["session-1"]?.title).toBe("Corrigir onboarding");
    expect(readSessionTitlesStore(stateDir).titles["session-1"]?.title).toBe("Corrigir onboarding");
    expect(vi.mocked(net.fetch)).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached title when the session seed did not change", async () => {
    vi.mocked(net.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            titles: [{ sessionKey: "session-1", title: "Corrigir onboarding" }],
          }),
        }),
        { status: 200 }
      )
    );

    await ensureFriendlySessionTitles({
      stateDir,
      sessions: [
        {
          sessionKey: "session-1",
          derivedTitle: "follow up on onboarding error and retry gateway bootstrap",
          lastMessagePreview: "check if settings screen still fails after reconnect",
        },
      ],
    });

    vi.mocked(net.fetch).mockClear();

    const titles = await ensureFriendlySessionTitles({
      stateDir,
      sessions: [
        {
          sessionKey: "session-1",
          derivedTitle: "follow up on onboarding error and retry gateway bootstrap",
          lastMessagePreview: "check if settings screen still fails after reconnect",
        },
      ],
    });

    expect(titles["session-1"]?.title).toBe("Corrigir onboarding");
    expect(vi.mocked(net.fetch)).not.toHaveBeenCalled();
  });
});
