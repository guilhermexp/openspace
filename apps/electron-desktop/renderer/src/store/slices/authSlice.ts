/**
 * Redux slice for backend authentication state (paid mode).
 * Tracks setup mode (paid vs self-managed), JWT, user info, balance, deployment, and subscription.
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import {
  backendApi,
  type DesktopStatusResponse,
  type DeploymentInfo,
  type SubscriptionInfo,
} from "@ipc/backendApi";

export type SetupMode = "paid" | "self-managed";

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
};

export const loadAuthFromStorage = createAsyncThunk("auth/loadFromStorage", async () => {
  const api = getDesktopApiOrNull();
  if (!api) return null;

  const { data } = await api.authGetToken();
  return data;
});

export const storeAuthToken = createAsyncThunk(
  "auth/storeToken",
  async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
    const api = getDesktopApiOrNull();
    if (api) {
      await api.authStoreToken(params);
    }
    return params;
  }
);

export const clearAuth = createAsyncThunk("auth/clear", async () => {
  const api = getDesktopApiOrNull();
  if (api) {
    await api.authClearToken();
  }
});

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
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAuthFromStorage.fulfilled, (state, action) => {
        if (action.payload) {
          state.jwt = action.payload.jwt;
          state.email = action.payload.email;
          state.userId = action.payload.userId;
          if (action.payload.jwt) {
            state.mode = "paid";
          }
        }
      })
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
      })
      .addCase(fetchDesktopStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDesktopStatus.fulfilled, (state, action) => {
        state.loading = false;
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
        state.error = action.error.message ?? "Failed to fetch status";
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
      });
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
