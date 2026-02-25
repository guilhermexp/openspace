/**
 * State orchestrator for the paid "Do everything for me" onboarding flow.
 * Manages: Google OAuth -> model select -> setup review -> Stripe subscription -> success.
 *
 * Model discovery reuses the gateway's models.list RPC (same as self-managed).
 * A placeholder OpenRouter key is saved after Google auth so the gateway can
 * enumerate models; the real key replaces it after Stripe payment completes.
 */
import React from "react";
import type { NavigateFunction } from "react-router-dom";

import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { storeAuthToken, authActions } from "@store/slices/authSlice";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { persistDesktopMode } from "../../shared/persistMode";
import { routes } from "../../app/routes";
import type { ModelEntry } from "@shared/models/modelPresentation";
import type { ConfigSnapshot, ModelsListResult } from "./types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";

type PaidOnboardingInput = {
  navigate: NavigateFunction;
};

export function usePaidOnboarding({ navigate }: PaidOnboardingInput) {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const jwt = useAppSelector((s) => s.auth.jwt);

  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [payBusy, setPayBusy] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [paymentPending, setPaymentPending] = React.useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = React.useState(false);

  // Subscription price (fetched from backend / Stripe)
  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

  // Model catalog state (loaded via gateway RPC, same as self-managed flow)
  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

  // ── Gateway config helpers ──

  const loadConfig = React.useCallback(async (): Promise<ConfigSnapshot> => {
    return gw.request<ConfigSnapshot>("config.get");
  }, [gw]);

  const savePlaceholderOpenRouterKey = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (api?.setApiKey) {
      await api.setApiKey("openrouter", "pending");
    }
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    const profileId = "openrouter:default";
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          auth: {
            profiles: {
              [profileId]: { provider: "openrouter", mode: "api_key" },
            },
            order: {
              openrouter: [profileId],
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: enable openrouter placeholder for paid flow",
    });
  }, [gw, loadConfig]);

  const loadModels = React.useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await gw.request<ModelsListResult>("models.list", {});
      const entries: ModelEntry[] = (result.models ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider,
        contextWindow: m.contextWindow,
        reasoning: m.reasoning,
      }));
      setModels(entries);
    } catch (err) {
      setModelsError(String(err));
    } finally {
      setModelsLoading(false);
    }
  }, [gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            agents: {
              defaults: {
                model: { primary: modelId },
                models: { [modelId]: {} },
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: set default model (paid)",
      });
    },
    [gw, loadConfig]
  );

  // ── Navigation helpers ──

  const goSetupMode = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-mode`);
  }, [navigate]);

  const goPaidModelSelect = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-model-select`);
  }, [navigate]);

  const goSetupReview = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-review`);
  }, [navigate]);

  const goSuccess = React.useCallback(() => {
    void navigate(`${routes.welcome}/success`);
  }, [navigate]);

  // ── Flow handlers ──

  const loadSubscriptionPrice = React.useCallback(async () => {
    try {
      const info = await backendApi.getSubscriptionInfo();
      setSubscriptionPrice(info);
    } catch {
      // Non-critical: UI will show a fallback price
    }
  }, []);

  const onStartChat = React.useCallback(
    async (openrouterApiKey: string | null) => {
      if (openrouterApiKey) {
        const api = getDesktopApiOrNull();
        if (api?.setApiKey) {
          await api.setApiKey("openrouter", openrouterApiKey);
        }
      }

      dispatch(authActions.setMode("paid"));
      void persistDesktopMode(gw.request, "paid");
      void dispatch(setOnboarded(true));
      void navigate(routes.chat, { replace: true });
    },
    [dispatch, gw.request, navigate]
  );

  const onGoogleAuthSuccess = React.useCallback(
    async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
      try {
        await dispatch(storeAuthToken(params));

        // If user already has an active subscription, skip payment but let them pick a model
        try {
          const status = await backendApi.getStatus(params.jwt);
          if (status.subscription && status.hasKey) {
            setAlreadySubscribed(true);
          }
        } catch {
          // Status check failed — continue with normal onboarding flow
        }

        await savePlaceholderOpenRouterKey();
        void loadSubscriptionPrice();
        await loadModels();
        goPaidModelSelect();
      } catch (err) {
        setAuthError(String(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [
      dispatch,
      savePlaceholderOpenRouterKey,
      loadSubscriptionPrice,
      loadModels,
      goPaidModelSelect,
      onStartChat,
    ]
  );

  const startGoogleAuth = React.useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const url = `${BACKEND_URL}/auth/google/desktop`;
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setAuthError(String(err));
      setAuthBusy(false);
    }
  }, []);

  const onPaidModelSelect = React.useCallback(
    async (modelId: string) => {
      setSelectedModel(modelId);
      await saveDefaultModel(modelId);

      if (alreadySubscribed && jwt) {
        // Already paid — fetch real keys and go straight to chat
        try {
          const keys = await backendApi.getKeys(jwt);
          await onStartChat(keys.openrouterApiKey);
        } catch {
          // Fallback: go to chat without replacing the placeholder key
          await onStartChat(null);
        }
        return;
      }

      goSetupReview();
    },
    [saveDefaultModel, goSetupReview, alreadySubscribed, jwt, onStartChat]
  );

  const onPay = React.useCallback(async () => {
    if (!jwt) {
      setPayError("Not authenticated");
      return;
    }

    setPayBusy(true);
    setPayError(null);

    try {
      const result = await backendApi.createSetupCheckout(jwt, {});

      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      } else {
        window.open(result.checkoutUrl, "_blank");
      }

      setPaymentPending(true);
    } catch (err) {
      setPayError(String(err));
    } finally {
      setPayBusy(false);
    }
  }, [jwt, selectedModel]);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    const unsub = api.onDeepLink((payload) => {
      if (payload.host === "auth" || payload.pathname === "/auth") {
        const { token, email, userId, isNewUser } = payload.params;
        if (token && email && userId) {
          void onGoogleAuthSuccess({
            jwt: token,
            email: decodeURIComponent(email),
            userId,
            isNewUser: isNewUser === "true",
          });
        } else {
          setAuthError("Authentication failed — missing token data");
          setAuthBusy(false);
        }
      } else if (payload.host === "stripe-success") {
        goSuccess();
      }
    });

    return unsub;
  }, [onGoogleAuthSuccess, goSuccess]);

  return {
    // State
    selectedModel,
    authBusy,
    authError,
    payBusy,
    payError,
    paymentPending,
    alreadySubscribed,
    jwt,
    backendUrl: BACKEND_URL,
    subscriptionPrice,

    // Model catalog (gateway-sourced)
    models,
    modelsLoading,
    modelsError,
    loadModels,

    // Navigation
    goSetupMode,
    goPaidModelSelect,
    goSetupReview,
    goSuccess,

    // Handlers
    startGoogleAuth,
    loadSubscriptionPrice,
    onPaidModelSelect,
    onPay,
    onStartChat,
  };
}
