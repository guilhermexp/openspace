import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { net } from "electron";

import type {
  SessionTitleMap,
  SessionTitleRecord,
  SessionTitleSeed,
} from "../../shared/session-titles-contract";
import { resolveOpenAiApiKeyFromStateDir } from "../keys/openai-api-key";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SESSION_TITLES_FILE = "friendly-session-titles.json";
const SESSION_TITLE_MODEL = "gpt-5.4-nano-2026-03-17";
const SESSION_TITLE_PROMPT_VERSION = "friendly-session-titles-v1";
const SESSION_TITLE_TIMEOUT_MS = 20_000;

type SessionTitlesStore = {
  version: number;
  titles: SessionTitleMap;
};

type TitleGenerationCandidate = SessionTitleSeed & {
  sourceHash: string;
};

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeFriendlyTitle(value: unknown): string {
  const normalized = normalizeText(value)
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/^[\s\-–—:;,.]+|[\s\-–—:;,.]+$/g, "");
  if (!normalized) {
    return "";
  }
  return normalized.length > 80 ? `${normalized.slice(0, 79).trimEnd()}…` : normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSessionTitleRecord(value: unknown): SessionTitleRecord | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const title = sanitizeFriendlyTitle(value.title);
  const sourceHash = normalizeText(value.sourceHash);
  const updatedAt = normalizeText(value.updatedAt);
  if (!title || !sourceHash || !updatedAt) {
    return null;
  }
  return { title, sourceHash, updatedAt };
}

function normalizeSeed(value: SessionTitleSeed): SessionTitleSeed | null {
  const sessionKey = normalizeText(value.sessionKey);
  if (!sessionKey) {
    return null;
  }
  return {
    sessionKey,
    derivedTitle: normalizeText(value.derivedTitle),
    lastMessagePreview: normalizeText(value.lastMessagePreview),
  };
}

function buildSourceHash(seed: SessionTitleSeed): string | null {
  const parts = [normalizeText(seed.derivedTitle), normalizeText(seed.lastMessagePreview)].filter(Boolean);
  if (!parts.length) {
    return null;
  }

  return createHash("sha256")
    .update(`${SESSION_TITLE_PROMPT_VERSION}\n${seed.sessionKey}\n${parts.join("\n")}`)
    .digest("hex");
}

function extractResponseText(payload: unknown): string {
  if (isPlainObject(payload) && typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  if (!isPlainObject(payload) || !Array.isArray(payload.output)) {
    return "";
  }

  const parts: string[] = [];
  for (const outputItem of payload.output) {
    if (!isPlainObject(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }
    for (const contentItem of outputItem.content) {
      if (!isPlainObject(contentItem)) {
        continue;
      }
      const text =
        typeof contentItem.text === "string"
          ? contentItem.text
          : typeof contentItem.output_text === "string"
            ? contentItem.output_text
            : "";
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join("\n").trim();
}

async function generateFriendlySessionTitles(params: {
  apiKey: string;
  sessions: TitleGenerationCandidate[];
}): Promise<Record<string, string>> {
  if (!params.sessions.length) {
    return {};
  }

  try {
    const response = await net.fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SESSION_TITLE_MODEL,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You create concise, polished titles for a desktop chat sidebar.",
                  "Return a JSON object with a single key `titles`.",
                  "Each item in `titles` must contain `sessionKey` and `title`.",
                  "Use the same language as the session content when obvious.",
                  "Keep titles concrete, natural, and at most 6 words.",
                  "Do not include quotes, prefixes, numbering, or explanations.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  sessions: params.sessions.map((session) => ({
                    sessionKey: session.sessionKey,
                    derivedTitle: session.derivedTitle ?? "",
                    lastMessagePreview: session.lastMessagePreview ?? "",
                  })),
                }),
              },
            ],
          },
        ],
        max_output_tokens: Math.max(300, params.sessions.length * 40),
      }),
      signal: AbortSignal.timeout(SESSION_TITLE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as unknown;
    const text = extractResponseText(payload);
    if (!text) {
      return {};
    }

    const parsed = JSON.parse(text) as unknown;
    if (!isPlainObject(parsed) || !Array.isArray(parsed.titles)) {
      return {};
    }

    const titles: Record<string, string> = {};
    for (const entry of parsed.titles) {
      if (!isPlainObject(entry)) {
        continue;
      }
      const sessionKey = normalizeText(entry.sessionKey);
      const title = sanitizeFriendlyTitle(entry.title);
      if (sessionKey && title) {
        titles[sessionKey] = title;
      }
    }

    return titles;
  } catch {
    return {};
  }
}

export function resolveSessionTitlesPath(stateDir: string): string {
  return path.join(stateDir, SESSION_TITLES_FILE);
}

export function readSessionTitlesStore(stateDir: string): SessionTitlesStore {
  const filePath = resolveSessionTitlesPath(stateDir);
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, titles: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!isPlainObject(parsed)) {
      return { version: 1, titles: {} };
    }

    const rawTitles = isPlainObject(parsed.titles) ? parsed.titles : {};
    const titles: SessionTitleMap = {};
    for (const [sessionKey, value] of Object.entries(rawTitles)) {
      const normalizedKey = normalizeText(sessionKey);
      const record = sanitizeSessionTitleRecord(value);
      if (normalizedKey && record) {
        titles[normalizedKey] = record;
      }
    }

    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      titles,
    };
  } catch {
    return { version: 1, titles: {} };
  }
}

export function writeSessionTitlesStore(params: { stateDir: string; store: SessionTitlesStore }): void {
  const filePath = resolveSessionTitlesPath(params.stateDir);
  const tmpPath = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(params.store, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export async function ensureFriendlySessionTitles(params: {
  stateDir: string;
  sessions: SessionTitleSeed[];
}): Promise<SessionTitleMap> {
  const store = readSessionTitlesStore(params.stateDir);
  const normalizedSeeds = params.sessions
    .map(normalizeSeed)
    .filter((seed): seed is SessionTitleSeed => seed !== null);

  if (!normalizedSeeds.length) {
    return store.titles;
  }

  const uniqueBySession = new Map<string, TitleGenerationCandidate>();
  for (const seed of normalizedSeeds) {
    const sourceHash = buildSourceHash(seed);
    if (!sourceHash) {
      continue;
    }
    uniqueBySession.set(seed.sessionKey, { ...seed, sourceHash });
  }

  const pending = Array.from(uniqueBySession.values()).filter((seed) => {
    const cached = store.titles[seed.sessionKey];
    return !cached || cached.sourceHash !== seed.sourceHash || !cached.title.trim();
  });

  if (!pending.length) {
    return store.titles;
  }

  const apiKey = resolveOpenAiApiKeyFromStateDir(params.stateDir);
  if (!apiKey) {
    return store.titles;
  }

  const generatedTitles = await generateFriendlySessionTitles({
    apiKey,
    sessions: pending,
  });

  if (!Object.keys(generatedTitles).length) {
    return store.titles;
  }

  const nextTitles: SessionTitleMap = { ...store.titles };
  let changed = false;
  for (const seed of pending) {
    const generatedTitle = sanitizeFriendlyTitle(generatedTitles[seed.sessionKey]);
    if (!generatedTitle) {
      continue;
    }
    nextTitles[seed.sessionKey] = {
      title: generatedTitle,
      sourceHash: seed.sourceHash,
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }

  if (!changed) {
    return store.titles;
  }

  writeSessionTitlesStore({
    stateDir: params.stateDir,
    store: { version: store.version, titles: nextTitles },
  });

  return nextTitles;
}
