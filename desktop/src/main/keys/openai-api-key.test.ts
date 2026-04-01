import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveOpenAiApiKeyFromStateDir } from "./openai-api-key";

describe("resolveOpenAiApiKeyFromStateDir", () => {
  let tmpDir: string;
  let stateDir: string;
  let authProfilesPath: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openai-api-key-test-"));
    stateDir = path.join(tmpDir, "state");
    authProfilesPath = path.join(stateDir, "agents", "main", "agent", "auth-profiles.json");
    await fsp.mkdir(path.dirname(authProfilesPath), { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when auth profiles do not exist", () => {
    expect(resolveOpenAiApiKeyFromStateDir(path.join(tmpDir, "missing"))).toBeNull();
  });

  it("prefers the default openai profile order", async () => {
    fs.writeFileSync(
      authProfilesPath,
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "openai:secondary": { type: "api_key", provider: "openai", key: "sk-secondary" },
            "openai:default": { type: "api_key", provider: "openai", key: "sk-default" },
          },
          order: {
            openai: ["openai:default", "openai:secondary"],
          },
        },
        null,
        2,
      ),
    );

    expect(resolveOpenAiApiKeyFromStateDir(stateDir)).toBe("sk-default");
  });

  it("falls back to any saved openai api key when order is missing", async () => {
    fs.writeFileSync(
      authProfilesPath,
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "anthropic:default": { type: "token", provider: "anthropic", token: "claude-token" },
            "openai:default": { type: "api_key", provider: "openai", key: "sk-fallback" },
          },
          order: {},
        },
        null,
        2,
      ),
    );

    expect(resolveOpenAiApiKeyFromStateDir(stateDir)).toBe("sk-fallback");
  });
});
