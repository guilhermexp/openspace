import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type AgentStatusState = {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  contextWindow: number;
  agentId: string | null;
  lastUpdated: number | null;
};

const initialState: AgentStatusState = {
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  contextWindow: 0,
  agentId: null,
  lastUpdated: null,
};

const agentStatusSlice = createSlice({
  name: "agentStatus",
  initialState,
  reducers: {
    statusUpdated(
      state,
      action: PayloadAction<{
        model: string;
        inputTokens: number;
        outputTokens: number;
        contextWindow: number;
        agentId?: string;
      }>
    ) {
      state.model = action.payload.model;
      state.inputTokens = action.payload.inputTokens;
      state.outputTokens = action.payload.outputTokens;
      state.contextWindow = action.payload.contextWindow;
      state.agentId = action.payload.agentId ?? state.agentId;
      state.lastUpdated = Date.now();
    },
    usageUpdated(
      state,
      action: PayloadAction<{
        model: string;
        inputTokens: number;
        outputTokens: number;
        contextWindow: number;
      }>
    ) {
      state.model = action.payload.model;
      state.inputTokens += action.payload.inputTokens;
      state.outputTokens += action.payload.outputTokens;
      state.contextWindow = action.payload.contextWindow;
      state.lastUpdated = Date.now();
    },
    cleared() {
      return initialState;
    },
  },
});

export const agentStatusActions = agentStatusSlice.actions;
export const agentStatusReducer = agentStatusSlice.reducer;
