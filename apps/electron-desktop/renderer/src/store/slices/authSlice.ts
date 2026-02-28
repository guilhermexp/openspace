/**
 * Redux slice for desktop auth state and mode-switching.
 * Central source of truth for: setup mode (paid vs self-managed), JWT,
 * user info, balance, deployment, subscription, and backup/restore logic.
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import {
  backendApi,
  type AutoTopUpSettingsResponse,
  type DesktopStatusResponse,
  type DeploymentInfo,
  type SubscriptionInfo,
  type UpdateAutoTopUpPayload,
} from "@ipc/backendApi";
import { reloadConfig } from "./configSlice";
import type { GatewayRequest } from "./chatSlice";

export type SetupMode = "paid" | "self-managed";

export type AutoTopUpState = {
  enabled: boolean;
  thresholdUsd: number;
  topupAmountUsd: number;
  monthlyCapUsd: number | null;
  hasPaymentMethod: boolean;
  currentMonthSpentUsd: number;
};

export const DEFAULT_AUTO_TOP_UP_SETTINGS: AutoTopUpState = {
  enabled: true,
  thresholdUsd: 2,
  topupAmountUsd: 10,
  monthlyCapUsd: 300,
  hasPaymentMethod: false,
  currentMonthSpentUsd: 0,
};

export type AuthSliceState = {
  mode: SetupMode | null;
  jwt: string | null;
  email: string | null;
  userId: string | null;
  balance: { remaining: number; limit: number; usage: number } | null;
  deployment: DeploymentInfo | null;
  subscription: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
  lastRefreshAt: number | null;
  refreshInFlight: boolean;
  refreshError: string | null;
  nextAllowedAt: number | null;
  refreshFailureCount: number;
  topUpPending: boolean;
  topUpError: string | null;
  autoTopUp: AutoTopUpState;
  autoTopUpLoading: boolean;
  autoTopUpSaving: boolean;
  autoTopUpError: string | null;
  autoTopUpLoaded: boolean;
};

const initialState: AuthSliceState = {
  mode: null,
  jwt: null,
  email: null,
  userId: null,
  balance: null,
  deployment: null,
  subscription: null,
  loading: false,
  error: null,
  lastRefreshAt: null,
  refreshInFlight: false,
  refreshError: null,
  nextAllowedAt: null,
  refreshFailureCount: 0,
  topUpPending: false,
  topUpError: null,
  autoTopUp: { ...DEFAULT_AUTO_TOP_UP_SETTINGS },
  autoTopUpLoading: false,
  autoTopUpSaving: false,
  autoTopUpError: null,
  autoTopUpLoaded: false,
};

export type AuthRefreshReason = "immediate" | "interval" | "focus" | "visibility";

// ── localStorage helpers ──────────────────────────────────────

const MODE_LS_KEY = "openclaw-desktop-mode";
const AUTH_TOKEN_LS_KEY = "openclaw-auth-token";
const BACKUP_LS_KEY = "openclaw-self-managed-backup";

type SelfManagedBackup = {
  credentials: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  };
  configAuth: {
    profiles?: Record<string, unknown>;
    order?: Record<string, unknown>;
  };
  configModel: {
    primary?: string;
    models?: Record<string, unknown>;
  };
  savedAt: string;
};

export function persistMode(mode: SetupMode): void {
  try {
    localStorage.setItem(MODE_LS_KEY, mode);
  } catch {
    // best effort
  }
}

function readPersistedMode(): SetupMode | null {
  try {
    const val = localStorage.getItem(MODE_LS_KEY);
    if (val === "paid" || val === "self-managed") return val;
    return null;
  } catch {
    return null;
  }
}

type PersistedAuthToken = { jwt: string; email: string; userId: string };

function persistAuthToken(data: PersistedAuthToken): void {
  try {
    localStorage.setItem(AUTH_TOKEN_LS_KEY, JSON.stringify(data));
  } catch {
    // best effort
  }
}

function readPersistedAuthToken(): PersistedAuthToken | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.jwt === "string") return parsed as unknown as PersistedAuthToken;
    return null;
  } catch {
    return null;
  }
}

function clearPersistedAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_LS_KEY);
  } catch {
    // ignore
  }
}

function readBackup(): SelfManagedBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelfManagedBackup;
  } catch {
    return null;
  }
}

function saveBackup(backup: SelfManagedBackup): void {
  try {
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(backup));
  } catch (err) {
    console.warn("[authSlice] Failed to save backup:", err);
  }
}

function clearBackup(): void {
  try {
    localStorage.removeItem(BACKUP_LS_KEY);
  } catch {
    // ignore
  }
}

// ── Config extraction helpers ─────────────────────────────────

type ConfigSnapshot = {
  config: Record<string, unknown>;
  hash?: string;
  exists?: boolean;
};

function extractAuth(cfg: Record<string, unknown>) {
  const auth =
    cfg.auth && typeof cfg.auth === "object" && !Array.isArray(cfg.auth)
      ? (cfg.auth as Record<string, unknown>)
      : {};
  return {
    profiles: auth.profiles as Record<string, unknown> | undefined,
    order: auth.order as Record<string, unknown> | undefined,
  };
}

function extractModel(cfg: Record<string, unknown>) {
  const agents =
    cfg.agents && typeof cfg.agents === "object" ? (cfg.agents as Record<string, unknown>) : {};
  const defaults =
    agents.defaults && typeof agents.defaults === "object"
      ? (agents.defaults as Record<string, unknown>)
      : {};
  const model =
    defaults.model && typeof defaults.model === "object"
      ? (defaults.model as Record<string, unknown>)
      : {};
  return {
    primary: typeof model.primary === "string" ? model.primary : undefined,
    models: defaults.models as Record<string, unknown> | undefined,
  };
}

function getBaseHash(snap: { hash?: string }): string | null {
  return typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
}

function normalizeAutoTopUpSettings(
  raw?: Partial<AutoTopUpSettingsResponse> | null
): AutoTopUpState {
  return {
    enabled: raw?.enabled ?? DEFAULT_AUTO_TOP_UP_SETTINGS.enabled,
    thresholdUsd: raw?.thresholdUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.thresholdUsd,
    topupAmountUsd: raw?.topupAmountUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.topupAmountUsd,
    monthlyCapUsd:
      raw?.monthlyCapUsd !== undefined
        ? raw.monthlyCapUsd
        : DEFAULT_AUTO_TOP_UP_SETTINGS.monthlyCapUsd,
    hasPaymentMethod: raw?.hasPaymentMethod ?? DEFAULT_AUTO_TOP_UP_SETTINGS.hasPaymentMethod,
    currentMonthSpentUsd:
      raw?.currentMonthSpentUsd ?? DEFAULT_AUTO_TOP_UP_SETTINGS.currentMonthSpentUsd,
  };
}

// ── Thunks ────────────────────────────────────────────────────

/**
 * Restore mode + JWT from localStorage on app startup.
 */
export const restoreMode = createAsyncThunk("auth/restoreMode", async (_: void, thunkApi) => {
  const token = readPersistedAuthToken();
  const persistedMode = readPersistedMode();

  if (token) {
    thunkApi.dispatch(authActions.setMode("paid"));
    thunkApi.dispatch(authActions.setAuth(token));
    persistMode("paid");
    return;
  }

  if (persistedMode) {
    thunkApi.dispatch(authActions.setMode(persistedMode));
  }
});

export const storeAuthToken = createAsyncThunk(
  "auth/storeToken",
  async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
    persistAuthToken({ jwt: params.jwt, email: params.email, userId: params.userId });
    return params;
  }
);

export const clearAuth = createAsyncThunk("auth/clear", async () => {
  clearPersistedAuthToken();
});

/**
 * Switch from self-managed to subscription (paid) mode.
 * Backs up credentials + config to localStorage, then clears them.
 */
export const switchToSubscription = createAsyncThunk(
  "auth/switchToSubscription",
  async ({ request }: { request: GatewayRequest }, thunkApi) => {
    const api = getDesktopApiOrNull();

    // 1. Read current credentials from auth-profiles.json
    let credentials: SelfManagedBackup["credentials"] = { profiles: {}, order: {} };
    if (api?.authReadProfiles) {
      try {
        credentials = await api.authReadProfiles();
      } catch (err) {
        console.warn("[authSlice] Failed to read auth profiles:", err);
      }
    }

    // 2. Read current config (auth + model sections)
    let configAuth: SelfManagedBackup["configAuth"] = {};
    let configModel: SelfManagedBackup["configModel"] = {};
    let baseHash: string | null = null;
    try {
      const snap = await request<ConfigSnapshot>("config.get", {});
      const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
        string,
        unknown
      >;
      configAuth = extractAuth(cfg);
      configModel = extractModel(cfg);
      baseHash = getBaseHash(snap);
    } catch (err) {
      console.warn("[authSlice] Failed to read config:", err);
    }

    // 3. Save backup to localStorage (skip if one already exists to stay idempotent —
    //    a second switchToSubscription call, e.g. from the deep-link handler, would
    //    otherwise overwrite the real backup with already-cleared data)
    if (!readBackup()) {
      saveBackup({
        credentials,
        configAuth,
        configModel,
        savedAt: new Date().toISOString(),
      });
    }

    // 4. Clear credentials (write empty store)
    if (api?.authWriteProfiles) {
      try {
        await api.authWriteProfiles({ profiles: {}, order: {} });
      } catch (err) {
        console.warn("[authSlice] Failed to clear auth profiles:", err);
      }
    }

    // 5. Clear config auth + model in a single patch.
    //    RFC 7396 merge-patch: null deletes a key, "" clears a string value.
    if (baseHash) {
      try {
        await request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              auth: { profiles: null, order: null },
              agents: { defaults: { model: { primary: "" } } },
            },
            null,
            2
          ),
          note: "Switch to subscription: clear self-managed config",
        });
      } catch (err) {
        console.warn("[authSlice] Failed to clear config:", err);
      }
    }

    // 6. Set mode
    thunkApi.dispatch(authActions.setMode("paid"));
    persistMode("paid");
  }
);

/**
 * Switch from subscription (paid) back to self-managed mode.
 * Clears subscription credentials, restores backup if available.
 */
export const switchToSelfManaged = createAsyncThunk(
  "auth/switchToSelfManaged",
  async ({ request }: { request: GatewayRequest }, thunkApi) => {
    const api = getDesktopApiOrNull();
    const backup = readBackup();

    // 1. Restore or clear credentials
    if (api?.authWriteProfiles) {
      try {
        const restoredProfiles = backup?.credentials ?? { profiles: {}, order: {} };
        await api.authWriteProfiles({
          profiles: restoredProfiles.profiles,
          order: restoredProfiles.order,
        });
      } catch (err) {
        console.warn("[authSlice] Failed to write auth profiles:", err);
      }
    }

    // 2. Clear subscription config and restore backup (or clear)
    try {
      const snap = await request<ConfigSnapshot>("config.get", {});
      const baseHash = getBaseHash(snap);
      if (baseHash) {
        const patch: Record<string, unknown> = backup
          ? {
              auth: {
                profiles: backup.configAuth.profiles ?? null,
                order: backup.configAuth.order ?? null,
              },
              agents: {
                defaults: {
                  model: backup.configModel.primary
                    ? { primary: backup.configModel.primary }
                    : { primary: "" },
                  models: backup.configModel.models ?? null,
                },
              },
            }
          : {
              auth: { profiles: null, order: null },
              agents: { defaults: { model: { primary: "" } } },
            };
        await request("config.patch", {
          baseHash,
          raw: JSON.stringify(patch, null, 2),
          note:
            "Switch to self-managed: clear subscription config" +
            (backup ? " and restore saved config" : ""),
        });
      }
    } catch (err) {
      console.warn("[authSlice] Failed to patch config:", err);
    }

    // 3. Clear JWT / auth state
    await thunkApi.dispatch(clearAuth());

    // 4. Set mode
    thunkApi.dispatch(authActions.setMode("self-managed"));
    persistMode("self-managed");

    // 5. Clean up backup
    clearBackup();

    return { hasBackup: !!backup };
  }
);

const SUBSCRIPTION_DEFAULT_MODEL = "openrouter/anthropic/claude-sonnet-4.6";

/**
 * Apply subscription keys from the backend after Google auth.
 * Fetches OpenRouter key, writes it via IPC, sets up auth profile in gateway config.
 * When no model is configured (e.g. login from settings, not onboarding),
 * defaults to Claude Sonnet 4.6 via OpenRouter.
 */
export const applySubscriptionKeys = createAsyncThunk(
  "auth/applySubscriptionKeys",
  async ({ token, request }: { token: string; request: GatewayRequest }, thunkApi) => {
    const api = getDesktopApiOrNull();

    const keys = await backendApi.getKeys(token);
    if (keys.openrouterApiKey && api?.setApiKey) {
      await api.setApiKey("openrouter", keys.openrouterApiKey);
    }
    if (keys.openaiApiKey && api?.setApiKey) {
      await api.setApiKey("openai", keys.openaiApiKey);
    }

    const snap = await request<ConfigSnapshot>("config.get", {});
    const baseHash = getBaseHash(snap);
    if (baseHash) {
      const profileId = "openrouter:default";

      const cfg = (snap.config && typeof snap.config === "object" ? snap.config : {}) as Record<
        string,
        unknown
      >;
      const currentModel = extractModel(cfg);
      const hasModel = !!currentModel.primary;

      const profiles: Record<string, { provider: string; mode: "api_key" }> = {
        [profileId]: { provider: "openrouter", mode: "api_key" },
      };
      const order: Record<string, string[]> = { openrouter: [profileId] };

      if (keys.openaiApiKey) {
        profiles["openai:default"] = { provider: "openai", mode: "api_key" };
        order.openai = ["openai:default"];
      }

      const patch: Record<string, unknown> = {
        auth: {
          profiles,
          order,
        },
      };

      if (!hasModel) {
        patch.agents = {
          defaults: {
            model: { primary: SUBSCRIPTION_DEFAULT_MODEL },
            models: { [SUBSCRIPTION_DEFAULT_MODEL]: {} },
          },
        };
      }

      await request("config.patch", {
        baseHash,
        raw: JSON.stringify(patch, null, 2),
        note: "Subscription login: apply backend-provided OpenRouter key",
      });
    }

    await thunkApi.dispatch(reloadConfig({ request }));
  }
);

/**
 * Log out: keep paid mode, clear auth token, reset config/auth to subscription baseline.
 */
export const handleLogout = createAsyncThunk(
  "auth/handleLogout",
  async ({ request }: { request: GatewayRequest }, thunkApi) => {
    await thunkApi.dispatch(switchToSubscription({ request })).unwrap();
    await thunkApi.dispatch(clearAuth()).unwrap();
    await thunkApi.dispatch(reloadConfig({ request }));
  }
);

export const fetchDesktopStatus = createAsyncThunk(
  "auth/fetchStatus",
  async (_: void, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.getStatus(jwt);
  }
);

export const fetchBalance = createAsyncThunk("auth/fetchBalance", async (_: void, thunkApi) => {
  const state = thunkApi.getState() as { auth: AuthSliceState };
  const { jwt } = state.auth;
  if (!jwt) throw new Error("Not authenticated");

  return backendApi.getBalance(jwt, true);
});

export const createAddonCheckout = createAsyncThunk(
  "auth/createAddonCheckout",
  async (params: { amountUsd: number }, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.createAddonCheckout(jwt, {
      amountUsd: params.amountUsd,
      successUrl: "atomicbot://addon-success",
      cancelUrl: "atomicbot://addon-cancel",
    });
  }
);

export const fetchAutoTopUpSettings = createAsyncThunk(
  "auth/fetchAutoTopUpSettings",
  async (_: void, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    return backendApi.getAutoTopUpSettings(jwt);
  }
);

export const patchAutoTopUpSettings = createAsyncThunk(
  "auth/patchAutoTopUpSettings",
  async (patch: UpdateAutoTopUpPayload, thunkApi) => {
    const state = thunkApi.getState() as { auth: AuthSliceState };
    const { jwt, autoTopUp } = state.auth;
    if (!jwt) throw new Error("Not authenticated");

    const payload: UpdateAutoTopUpPayload = {
      enabled: patch.enabled ?? autoTopUp.enabled,
      thresholdUsd: patch.thresholdUsd ?? autoTopUp.thresholdUsd,
      topupAmountUsd: patch.topupAmountUsd ?? autoTopUp.topupAmountUsd,
      monthlyCapUsd:
        patch.monthlyCapUsd !== undefined ? patch.monthlyCapUsd : autoTopUp.monthlyCapUsd,
    };

    return backendApi.updateAutoTopUpSettings(jwt, payload);
  },
  {
    condition: (_patch, thunkApi) => {
      const state = thunkApi.getState() as { auth: AuthSliceState };
      return !state.auth.autoTopUpSaving;
    },
  }
);

// ── Slice ─────────────────────────────────────────────────────

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<SetupMode>) {
      state.mode = action.payload;
    },
    setAuth(state, action: PayloadAction<{ jwt: string; email: string; userId: string }>) {
      state.jwt = action.payload.jwt;
      state.email = action.payload.email;
      state.userId = action.payload.userId;
      state.error = null;
    },
    setBalance(
      state,
      action: PayloadAction<{ remaining: number; limit: number; usage: number } | null>
    ) {
      state.balance = action.payload;
    },
    clearAuthState(state) {
      state.jwt = null;
      state.email = null;
      state.userId = null;
      state.balance = null;
      state.deployment = null;
      state.subscription = null;
      state.error = null;
      state.lastRefreshAt = null;
      state.refreshInFlight = false;
      state.refreshError = null;
      state.nextAllowedAt = null;
      state.refreshFailureCount = 0;
      state.topUpPending = false;
      state.topUpError = null;
      state.autoTopUp = { ...DEFAULT_AUTO_TOP_UP_SETTINGS };
      state.autoTopUpLoading = false;
      state.autoTopUpSaving = false;
      state.autoTopUpError = null;
      state.autoTopUpLoaded = false;
    },
    requestBackgroundRefresh(state, _action: PayloadAction<{ reason: AuthRefreshReason }>) {
      // reducer is intentionally empty; handled by listener middleware
    },
    appFocused(state) {
      // reducer is intentionally empty; handled by listener middleware
    },
    appVisible(state) {
      // reducer is intentionally empty; handled by listener middleware
    },
    markRefreshStarted(state) {
      state.refreshInFlight = true;
    },
    markRefreshSucceeded(state, action: PayloadAction<{ at: number; nextAllowedAt: number }>) {
      state.refreshInFlight = false;
      state.lastRefreshAt = action.payload.at;
      state.nextAllowedAt = action.payload.nextAllowedAt;
      state.refreshError = null;
      state.refreshFailureCount = 0;
    },
    markRefreshFailed(state, action: PayloadAction<{ message: string; nextAllowedAt: number }>) {
      state.refreshInFlight = false;
      state.refreshError = action.payload.message;
      state.nextAllowedAt = action.payload.nextAllowedAt;
      state.refreshFailureCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(storeAuthToken.fulfilled, (state, action) => {
        state.jwt = action.payload.jwt;
        state.email = action.payload.email;
        state.userId = action.payload.userId;
        state.mode = "paid";
        state.error = null;
      })
      .addCase(clearAuth.fulfilled, (state) => {
        state.jwt = null;
        state.email = null;
        state.userId = null;
        state.balance = null;
        state.deployment = null;
        state.subscription = null;
        state.lastRefreshAt = null;
        state.refreshInFlight = false;
        state.refreshError = null;
        state.nextAllowedAt = null;
        state.refreshFailureCount = 0;
        state.topUpPending = false;
        state.topUpError = null;
        state.autoTopUp = { ...DEFAULT_AUTO_TOP_UP_SETTINGS };
        state.autoTopUpLoading = false;
        state.autoTopUpSaving = false;
        state.autoTopUpError = null;
        state.autoTopUpLoaded = false;
      })
      .addCase(fetchDesktopStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDesktopStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.refreshInFlight = false;
        const resp = action.payload as DesktopStatusResponse;
        if (
          resp.balance &&
          typeof resp.balance.remaining === "number" &&
          typeof resp.balance.limit === "number"
        ) {
          state.balance = {
            remaining: resp.balance.remaining,
            limit: resp.balance.limit,
            usage: resp.balance.usage ?? 0,
          };
        }
        state.deployment = resp.deployment ?? null;
        state.subscription = resp.subscription ?? null;
      })
      .addCase(fetchDesktopStatus.rejected, (state, action) => {
        state.loading = false;
        state.refreshInFlight = false;
        const message = action.error.message ?? "Failed to fetch status";
        state.error = message;
        state.refreshError = message;
      })
      .addCase(fetchBalance.fulfilled, (state, action) => {
        const resp = action.payload;
        if (typeof resp.remaining === "number" && typeof resp.limit === "number") {
          state.balance = {
            remaining: resp.remaining,
            limit: resp.limit,
            usage: resp.usage ?? 0,
          };
        }
      })
      .addCase(createAddonCheckout.pending, (state) => {
        state.topUpPending = true;
        state.topUpError = null;
      })
      .addCase(createAddonCheckout.fulfilled, (state) => {
        state.topUpPending = false;
      })
      .addCase(createAddonCheckout.rejected, (state, action) => {
        state.topUpPending = false;
        state.topUpError = action.error.message ?? "Failed to create top-up checkout";
      })
      .addCase(fetchAutoTopUpSettings.pending, (state) => {
        state.autoTopUpLoading = true;
        state.autoTopUpError = null;
      })
      .addCase(fetchAutoTopUpSettings.fulfilled, (state, action) => {
        state.autoTopUpLoading = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(action.payload);
      })
      .addCase(fetchAutoTopUpSettings.rejected, (state, action) => {
        state.autoTopUpLoading = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(null);
        state.autoTopUpError = action.error.message ?? "Failed to fetch auto top-up settings";
      })
      .addCase(patchAutoTopUpSettings.pending, (state) => {
        state.autoTopUpSaving = true;
        state.autoTopUpError = null;
      })
      .addCase(patchAutoTopUpSettings.fulfilled, (state, action) => {
        state.autoTopUpSaving = false;
        state.autoTopUpLoaded = true;
        state.autoTopUp = normalizeAutoTopUpSettings(action.payload);
      })
      .addCase(patchAutoTopUpSettings.rejected, (state, action) => {
        state.autoTopUpSaving = false;
        state.autoTopUpError = action.error.message ?? "Failed to save auto top-up settings";
      });
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
