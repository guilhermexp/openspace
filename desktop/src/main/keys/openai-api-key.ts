import { readAuthProfilesStore, resolveAuthProfilesPath } from "./authProfilesStore";

export const OPENCLAW_DESKTOP_OPENAI_TTS_API_KEY_ENV = "OPENCLAW_DESKTOP_OPENAI_TTS_API_KEY";

export function resolveOpenAiApiKeyFromStateDir(stateDir: string): string | null {
  const authProfilesPath = resolveAuthProfilesPath({ stateDir });
  const store = readAuthProfilesStore({ authProfilesPath });

  const orderedIds = Array.isArray(store.order.openai) ? store.order.openai : [];
  for (const profileId of orderedIds) {
    const profile = store.profiles[profileId];
    if (profile?.type === "api_key" && profile.provider === "openai" && profile.key.trim()) {
      return profile.key.trim();
    }
  }

  for (const profile of Object.values(store.profiles)) {
    if (profile.type === "api_key" && profile.provider === "openai" && profile.key.trim()) {
      return profile.key.trim();
    }
  }

  return null;
}
