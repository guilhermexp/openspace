/**
 * Redux slice for desktop auth state.
 * Simplified: only self-managed mode exists (no paid subscription).
 */
import { createSlice } from "@reduxjs/toolkit";

export interface AuthSliceState {
  mode: "self-managed" | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthSliceState = {
  mode: "self-managed",
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
