/**
 * Hardcoded extra models injected into the renderer's model picker via IPC.
 * Only providers with forward-compat support in the gateway are listed here
 * (the gateway resolves unknown model IDs at request time, so models.json
 * entries are not required).
 *
 * Remove an entry once core adds the model natively.
 */

export type ExtraModelEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
};

const EXTRA_MODELS: ExtraModelEntry[] = [
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "openai-codex",
    contextWindow: 272_000,
    reasoning: true,
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    provider: "openai-codex",
    contextWindow: 272_000,
    reasoning: true,
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "openai-codex",
    contextWindow: 272_000,
    reasoning: true,
  },
  {
    id: "gpt-5.3-codex-spark",
    name: "GPT-5.3 Codex Spark",
    provider: "openai-codex",
    contextWindow: 128_000,
    reasoning: true,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai-codex",
    contextWindow: 1_047_576,
    reasoning: true,
  },
  {
    id: "glm-5-turbo",
    name: "GLM-5-Turbo",
    provider: "zai",
    contextWindow: 200_000,
    reasoning: true,
  },
];

export function getExtraModels(): ExtraModelEntry[] {
  return EXTRA_MODELS;
}
