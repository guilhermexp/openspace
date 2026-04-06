import { configureStore } from "@reduxjs/toolkit";
import { agentStatusReducer } from "./slices/agentStatusSlice";
import { authReducer } from "./slices/auth/authSlice";
import { chatReducer } from "./slices/chat/chatSlice";
import { configReducer } from "./slices/configSlice";
import { gatewayReducer } from "./slices/gatewaySlice";
import { onboardingReducer } from "./slices/onboardingSlice";
import { whisperReducer } from "./slices/whisperSlice";

export const store = configureStore({
  reducer: {
    agentStatus: agentStatusReducer,
    auth: authReducer,
    chat: chatReducer,
    config: configReducer,
    gateway: gatewayReducer,
    onboarding: onboardingReducer,
    whisper: whisperReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActionPaths: ["meta.arg.request"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
