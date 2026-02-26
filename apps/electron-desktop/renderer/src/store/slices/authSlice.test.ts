/**
 * Tests for authSlice — initial state, reducers, and all thunks.
 */
import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AuthSliceState,
  authActions,
  authReducer,
  restoreMode,
  storeAuthToken,
  clearAuth,
  switchToSubscription,
  switchToSelfManaged,
  applySubscriptionKeys,
  handleLogout,
  createAddonCheckout,
} from "./authSlice";
import { configReducer } from "./configSlice";

// ── localStorage shim ───────────────────────────────────────────────────────

const storageMap = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

const MODE_LS_KEY = "openclaw-desktop-mode";
const BACKUP_LS_KEY = "openclaw-self-managed-backup";

// ── Mock desktop API ────────────────────────────────────────────────────────

const mockApi = {
  authGetToken: vi.fn().mockResolvedValue({ data: null }),
  authStoreToken: vi.fn().mockResolvedValue(undefined),
  authClearToken: vi.fn().mockResolvedValue(undefined),
  authReadProfiles: vi.fn().mockResolvedValue({ profiles: {}, order: {} }),
  authWriteProfiles: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockApi,
}));

// ── Mock backend API ────────────────────────────────────────────────────────

const mockBackendApi = {
  getKeys: vi.fn().mockResolvedValue({ openrouterApiKey: "sk-or-test-key", openaiApiKey: null }),
  getStatus: vi
    .fn()
    .mockResolvedValue({ hasKey: true, balance: null, deployment: null, subscription: null }),
  getBalance: vi.fn().mockResolvedValue({ remaining: 50, limit: 100, usage: 50 }),
  createAddonCheckout: vi.fn().mockResolvedValue({ checkoutUrl: "https://stripe.test/checkout" }),
};

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getKeys: (...args: unknown[]) => mockBackendApi.getKeys(...args),
    getStatus: (...args: unknown[]) => mockBackendApi.getStatus(...args),
    getBalance: (...args: unknown[]) => mockBackendApi.getBalance(...args),
    createAddonCheckout: (...args: unknown[]) => mockBackendApi.createAddonCheckout(...args),
  },
}));

// ── Test store factory ──────────────────────────────────────────────────────

function createTestStore() {
  return configureStore({
    reducer: { auth: authReducer, config: configReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActionPaths: ["meta.arg.request"],
        },
      }),
  });
}

// ── Mock gateway request ────────────────────────────────────────────────────

function createMockRequest() {
  const configSnap = {
    config: {
      auth: {
        profiles: { "anthropic:default": { provider: "anthropic", mode: "api_key" } },
        order: { anthropic: ["anthropic:default"] },
      },
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4.6" },
          models: { "anthropic/claude-sonnet-4.6": {} },
        },
      },
    },
    hash: "abc123",
    exists: true,
  };

  return vi.fn().mockImplementation((method: string) => {
    if (method === "config.get") return Promise.resolve(configSnap);
    if (method === "config.patch") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  });
}

// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  storageMap.clear();
  // @ts-expect-error - shimming localStorage for node env
  globalThis.localStorage = localStorageShim;

  vi.clearAllMocks();
  mockApi.authGetToken.mockResolvedValue({ data: null });
  mockApi.authReadProfiles.mockResolvedValue({ profiles: {}, order: {} });
});

afterEach(() => {
  storageMap.clear();
});

// ── Initial state ───────────────────────────────────────────────────────────

describe("authSlice initial state", () => {
  it("starts with all fields null/false", () => {
    const state = authReducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({
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
    });
  });
});

// ── Reducers ────────────────────────────────────────────────────────────────

describe("authSlice reducers", () => {
  const base: AuthSliceState = {
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
  };

  it("setMode sets mode to paid", () => {
    const state = authReducer(base, authActions.setMode("paid"));
    expect(state.mode).toBe("paid");
  });

  it("setMode sets mode to self-managed", () => {
    const state = authReducer(base, authActions.setMode("self-managed"));
    expect(state.mode).toBe("self-managed");
  });

  it("setAuth sets jwt, email, userId and clears error", () => {
    const withError = { ...base, error: "some error" };
    const state = authReducer(
      withError,
      authActions.setAuth({ jwt: "tok", email: "a@b.com", userId: "u1" })
    );
    expect(state.jwt).toBe("tok");
    expect(state.email).toBe("a@b.com");
    expect(state.userId).toBe("u1");
    expect(state.error).toBeNull();
  });

  it("setBalance sets balance", () => {
    const state = authReducer(
      base,
      authActions.setBalance({ remaining: 90, limit: 100, usage: 10 })
    );
    expect(state.balance).toEqual({ remaining: 90, limit: 100, usage: 10 });
  });

  it("setBalance clears balance with null", () => {
    const withBalance = {
      ...base,
      balance: { remaining: 90, limit: 100, usage: 10 },
    };
    const state = authReducer(withBalance, authActions.setBalance(null));
    expect(state.balance).toBeNull();
  });

  it("clearAuthState clears all auth fields", () => {
    const full: AuthSliceState = {
      ...base,
      jwt: "tok",
      email: "a@b.com",
      userId: "u1",
      balance: { remaining: 1, limit: 2, usage: 1 },
      deployment: { id: "d1", status: "running", billingStatus: "active", dropletId: null },
      subscription: {
        status: "active",
        currentPeriodEnd: "2026-03-01",
        stripeSubscriptionId: "sub_1",
      },
      error: "err",
    };
    const state = authReducer(full, authActions.clearAuthState());
    expect(state.jwt).toBeNull();
    expect(state.email).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.balance).toBeNull();
    expect(state.deployment).toBeNull();
    expect(state.subscription).toBeNull();
    expect(state.error).toBeNull();
  });
});

// ── restoreMode thunk ───────────────────────────────────────────────────────

describe("restoreMode thunk", () => {
  it("with JWT in electron store: sets mode paid and auth data", async () => {
    mockApi.authGetToken.mockResolvedValue({
      data: { jwt: "jwt-tok", email: "user@test.com", userId: "uid1" },
    });

    const store = createTestStore();
    await store.dispatch(restoreMode());

    const state = store.getState().auth;
    expect(state.mode).toBe("paid");
    expect(state.jwt).toBe("jwt-tok");
    expect(state.email).toBe("user@test.com");
    expect(state.userId).toBe("uid1");
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
  });

  it("without JWT but mode in localStorage: restores mode", async () => {
    storageMap.set(MODE_LS_KEY, "paid");

    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
  });

  it("without JWT and no persisted mode: mode stays null", async () => {
    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBeNull();
  });

  it("restores self-managed mode from localStorage", async () => {
    storageMap.set(MODE_LS_KEY, "self-managed");

    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBe("self-managed");
  });
});

// ── storeAuthToken thunk ────────────────────────────────────────────────────

describe("storeAuthToken thunk", () => {
  it("stores token via IPC and sets state", async () => {
    const store = createTestStore();
    await store.dispatch(
      storeAuthToken({ jwt: "j1", email: "e@t.com", userId: "u1", isNewUser: false })
    );

    const state = store.getState().auth;
    expect(state.jwt).toBe("j1");
    expect(state.email).toBe("e@t.com");
    expect(state.userId).toBe("u1");
    expect(state.mode).toBe("paid");
    expect(mockApi.authStoreToken).toHaveBeenCalledWith({
      jwt: "j1",
      email: "e@t.com",
      userId: "u1",
      isNewUser: false,
    });
  });
});

// ── clearAuth thunk ─────────────────────────────────────────────────────────

describe("clearAuth thunk", () => {
  it("clears auth state and calls IPC", async () => {
    const store = createTestStore();
    // Pre-fill some state
    store.dispatch(authActions.setAuth({ jwt: "tok", email: "a@b.com", userId: "u1" }));
    expect(store.getState().auth.jwt).toBe("tok");

    await store.dispatch(clearAuth());

    const state = store.getState().auth;
    expect(state.jwt).toBeNull();
    expect(state.email).toBeNull();
    expect(state.userId).toBeNull();
    expect(mockApi.authClearToken).toHaveBeenCalled();
  });
});

// ── switchToSubscription thunk ──────────────────────────────────────────────

describe("switchToSubscription thunk", () => {
  it("backs up config and credentials to localStorage", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: { "anthropic:default": { key: "sk-ant-xxx" } },
      order: { anthropic: ["anthropic:default"] },
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    const backup = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backup.credentials.profiles).toHaveProperty("anthropic:default");
    expect(backup.configAuth.profiles).toHaveProperty("anthropic:default");
    expect(backup.configModel.primary).toBe("anthropic/claude-sonnet-4.6");
    expect(backup.savedAt).toBeDefined();
  });

  it("clears credentials via IPC", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(mockApi.authWriteProfiles).toHaveBeenCalledWith({ profiles: {}, order: {} });
  });

  it("sends config.patch with null for auth and empty string for model", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(mockRequest).toHaveBeenCalledWith("config.get", {});
    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });

  it("sets mode to paid in state and localStorage", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(store.getState().auth.mode).toBe("paid");
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
  });

  it("does not overwrite existing backup on second call (idempotent)", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: "sk-ant-real" },
      },
      order: { anthropic: ["anthropic:default"] },
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store.dispatch(switchToSubscription({ request: mockRequest }));
    const backupAfterFirst = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backupAfterFirst.credentials.profiles["anthropic:default"].key).toBe("sk-ant-real");

    mockApi.authReadProfiles.mockResolvedValue({
      profiles: {},
      order: {},
    });

    await store.dispatch(switchToSubscription({ request: mockRequest }));
    const backupAfterSecond = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backupAfterSecond.credentials.profiles["anthropic:default"].key).toBe("sk-ant-real");
  });
});

// ── switchToSelfManaged thunk ───────────────────────────────────────────────

describe("switchToSelfManaged thunk", () => {
  const savedBackup = {
    credentials: {
      profiles: { "anthropic:default": { key: "sk-ant-xxx" } },
      order: { anthropic: ["anthropic:default"] },
    },
    configAuth: {
      profiles: { "anthropic:default": { provider: "anthropic", mode: "api_key" } },
      order: { anthropic: ["anthropic:default"] },
    },
    configModel: {
      primary: "anthropic/claude-sonnet-4.6",
      models: { "anthropic/claude-sonnet-4.6": {} },
    },
    savedAt: "2026-02-25T00:00:00.000Z",
  };

  it("with backup: restores credentials, config, clears JWT, returns hasBackup true", async () => {
    storageMap.set(BACKUP_LS_KEY, JSON.stringify(savedBackup));

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "sub-jwt", email: "u@t.com", userId: "u1" }));

    const mockRequest = createMockRequest();
    const result = await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    expect(result.hasBackup).toBe(true);
    expect(store.getState().auth.mode).toBe("self-managed");
    expect(store.getState().auth.jwt).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("self-managed");
    expect(storageMap.has(BACKUP_LS_KEY)).toBe(false);

    expect(mockApi.authWriteProfiles).toHaveBeenCalledWith({
      profiles: savedBackup.credentials.profiles,
      order: savedBackup.credentials.order,
    });

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toEqual(savedBackup.configAuth.profiles);
    expect(patchBody.agents.defaults.model.primary).toBe("anthropic/claude-sonnet-4.6");
  });

  it("without backup: clears config, returns hasBackup false", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    const result = await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    expect(result.hasBackup).toBe(false);
    expect(store.getState().auth.mode).toBe("self-managed");
    expect(storageMap.get(MODE_LS_KEY)).toBe("self-managed");

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });
});

// ── applySubscriptionKeys thunk ─────────────────────────────────────────────

describe("applySubscriptionKeys thunk", () => {
  it("fetches keys from backend and applies OpenRouter/OpenAI profiles", async () => {
    mockBackendApi.getKeys.mockResolvedValueOnce({
      openrouterApiKey: "sk-or-test-key",
      openaiApiKey: "sk-openai-test-key",
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    expect(mockBackendApi.getKeys).toHaveBeenCalledWith("jwt-tok");
    expect(mockApi.setApiKey).toHaveBeenCalledWith("openrouter", "sk-or-test-key");
    expect(mockApi.setApiKey).toHaveBeenCalledWith("openai", "sk-openai-test-key");

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles["openrouter:default"]).toEqual({
      provider: "openrouter",
      mode: "api_key",
    });
    expect(patchBody.auth.order.openrouter).toEqual(["openrouter:default"]);
    expect(patchBody.auth.profiles["openai:default"]).toEqual({
      provider: "openai",
      mode: "api_key",
    });
    expect(patchBody.auth.order.openai).toEqual(["openai:default"]);
  });

  it("does not call setApiKey when backend returns null key", async () => {
    mockBackendApi.getKeys.mockResolvedValueOnce({ openrouterApiKey: null, openaiApiKey: null });

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    expect(mockApi.setApiKey).not.toHaveBeenCalled();
  });

  it("sets default model when no model is configured", async () => {
    const noModelSnap = {
      config: { auth: {}, agents: { defaults: { model: { primary: "" } } } },
      hash: "no-model-hash",
      exists: true,
    };
    const mockRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "config.get") return Promise.resolve(noModelSnap);
      if (method === "config.patch") return Promise.resolve({ ok: true });
      return Promise.resolve({});
    });

    const store = createTestStore();
    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.agents.defaults.model.primary).toBe("openrouter/anthropic/claude-sonnet-4.6");
    expect(patchBody.agents.defaults.models).toHaveProperty(
      "openrouter/anthropic/claude-sonnet-4.6"
    );
  });

  it("does not override model when one is already configured", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.agents).toBeUndefined();
  });
});

// ── handleLogout thunk ──────────────────────────────────────────────────────

describe("handleLogout thunk", () => {
  it("keeps paid mode, clears JWT, and applies subscription reset", async () => {
    const backup = {
      credentials: { profiles: {}, order: {} },
      configAuth: {},
      configModel: { primary: "openai/gpt-4o" },
      savedAt: "2026-02-25T00:00:00.000Z",
    };
    storageMap.set(BACKUP_LS_KEY, JSON.stringify(backup));

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "sub-jwt", email: "u@t.com", userId: "u1" }));

    const mockRequest = createMockRequest();
    await store.dispatch(handleLogout({ request: mockRequest })).unwrap();

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
    expect(store.getState().auth.email).toBeNull();
    expect(store.getState().auth.userId).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
    expect(mockApi.authClearToken).toHaveBeenCalled();

    expect(mockRequest).toHaveBeenCalledWith("config.get", {});
    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });

  it("creates backup when missing and remains in paid mode", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(handleLogout({ request: mockRequest })).unwrap();

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
    expect(storageMap.get(BACKUP_LS_KEY)).toBeDefined();
  });
});

// ── createAddonCheckout thunk ────────────────────────────────────────────────

describe("createAddonCheckout thunk", () => {
  it("creates checkout url when authenticated", async () => {
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "jwt-tok", email: "u@t.com", userId: "u1" }));

    const result = await store.dispatch(createAddonCheckout({ amountUsd: 25 })).unwrap();

    expect(result).toEqual({ checkoutUrl: "https://stripe.test/checkout" });
    expect(mockBackendApi.createAddonCheckout).toHaveBeenCalledWith("jwt-tok", {
      amountUsd: 25,
      successUrl: "atomicbot://addon-success",
      cancelUrl: "atomicbot://addon-cancel",
    });
    expect(store.getState().auth.topUpPending).toBe(false);
    expect(store.getState().auth.topUpError).toBeNull();
  });

  it("fails without JWT and stores top-up error", async () => {
    const store = createTestStore();

    await expect(store.dispatch(createAddonCheckout({ amountUsd: 10 })).unwrap()).rejects.toThrow(
      "Not authenticated"
    );

    expect(mockBackendApi.createAddonCheckout).not.toHaveBeenCalled();
    expect(store.getState().auth.topUpPending).toBe(false);
    expect(store.getState().auth.topUpError).toBe("Not authenticated");
  });

  it("sets pending state on pending action", () => {
    const state = authReducer(undefined, createAddonCheckout.pending("req", { amountUsd: 12 }));
    expect(state.topUpPending).toBe(true);
    expect(state.topUpError).toBeNull();
  });
});
