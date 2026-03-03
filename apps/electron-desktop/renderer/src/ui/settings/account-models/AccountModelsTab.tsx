/**
 * Unified "Connection & AI Models" settings tab.
 * Shows a Connection toggle (paid / self-managed) at the top,
 * then Provider/Model selectors, and mode-specific content below:
 *   - paid: AccountTab billing/balance content
 *   - self-managed: inline API key entry
 *
 * @deprecated Scheduled for removal.
 */
import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import { switchToSubscription, switchToSelfManaged } from "@store/slices/auth/authSlice";
import { reloadConfig, type ConfigData } from "@store/slices/configSlice";
import { addToastError } from "@shared/toast";
import { Modal } from "@shared/kit";

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  resolveProviderIconUrl,
} from "@shared/models/providers";
import { getModelTier, formatModelMeta, TIER_INFO } from "@shared/models/modelPresentation";
import { useModelProvidersState } from "../providers/useModelProvidersState";
import { AccountTab } from "../account/AccountTab";
import { RichSelect, type RichOption } from "./RichSelect";
import { InlineApiKey } from "./InlineApiKey";
import s from "./AccountModelsTab.module.css";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  connected?: boolean;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: ConfigData;
};

function providerBadge(p: (typeof MODEL_PROVIDERS)[number]):
  | {
      text: string;
      variant: string;
    }
  | undefined {
  if (p.recommended) return { text: "Recommended", variant: "recommended" };
  if (p.popular) return { text: "Popular", variant: "popular" };
  return undefined;
}

function ConnectionToggle(props: {
  isPaid: boolean;
  disabled: boolean;
  onSelect: (mode: "paid" | "self-managed") => void;
}) {
  return (
    <div className={s.connectionSection}>
      <div className={s.connectionLabel}>Connection</div>
      <div className={s.connectionSelector} role="radiogroup" aria-label="Connection mode">
        <button
          type="button"
          className={`${s.connectionOption}${props.isPaid ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => props.onSelect("paid")}
          disabled={props.disabled}
        >
          Atomic Bot Account
        </button>
        <button
          type="button"
          className={`${s.connectionOption}${!props.isPaid ? ` ${s["connectionOption--active"]}` : ""}`}
          onClick={() => props.onSelect("self-managed")}
          disabled={props.disabled}
        >
          Own API key
        </button>
      </div>
    </div>
  );
}

export function AccountModelsTab(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((st) => st.auth.mode);
  const isPaidMode = authMode === "paid";

  const [modeSwitchBusy, setModeSwitchBusy] = React.useState(false);
  const [confirmModeSwitch, setConfirmModeSwitch] = React.useState<"paid" | "self-managed" | null>(
    null
  );

  const state = useModelProvidersState({
    ...props,
    isPaidMode,
  });

  // Auto-select provider from current active model on first load (self-managed only)
  const autoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (
      !isPaidMode &&
      !autoSelectedRef.current &&
      state.activeProviderKey &&
      !state.providerFilter
    ) {
      autoSelectedRef.current = true;
      state.setProviderFilter(state.activeProviderKey);
    }
  }, [isPaidMode, state.activeProviderKey, state.providerFilter, state.setProviderFilter]);

  const selectedProvider = state.providerFilter;
  const selectedProviderInfo = selectedProvider
    ? (MODEL_PROVIDER_BY_ID[selectedProvider] ?? null)
    : null;

  const providerOptions: RichOption<ModelProvider>[] = React.useMemo(
    () =>
      MODEL_PROVIDERS.map((p) => ({
        value: p.id,
        label: p.name,
        icon: resolveProviderIconUrl(p.id),
        description: p.description,
        badge: providerBadge(p),
      })),
    []
  );

  const isSelectedProviderConfigured = selectedProvider
    ? state.isProviderConfigured(selectedProvider)
    : false;

  const modelOptions: RichOption<string>[] = React.useMemo(() => {
    if (isPaidMode) {
      const TIER_RANK: Record<string, number> = { ultra: 0, pro: 1, fast: 2 };
      const withTiers = state.sortedModels.map((m) => ({
        model: m,
        tier: getModelTier(m),
      }));
      withTiers.sort((a, b) => {
        const aRank = a.tier ? (TIER_RANK[a.tier] ?? 99) : 99;
        const bRank = b.tier ? (TIER_RANK[b.tier] ?? 99) : 99;
        return aRank - bRank;
      });
      return withTiers.map(({ model: m, tier }) => {
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
        };
      });
    }
    if (!selectedProvider) return [];
    return state.sortedModels
      .filter((m) => m.provider === selectedProvider)
      .map((m) => {
        const tier = getModelTier(m);
        const meta = formatModelMeta(m);
        const badge = tier ? { text: TIER_INFO[tier].label, variant: tier } : undefined;
        return {
          value: `${m.provider}/${m.id}`,
          label: m.name,
          meta: meta ?? undefined,
          badge,
        };
      });
  }, [isPaidMode, selectedProvider, state.sortedModels]);

  const handleProviderChange = React.useCallback(
    (value: ModelProvider) => {
      state.setProviderFilter(value);
    },
    [state.setProviderFilter]
  );

  const handleModelChange = React.useCallback(
    (value: string) => {
      void state.saveDefaultModel(value);
    },
    [state.saveDefaultModel]
  );

  const handleOAuthSuccess = React.useCallback(() => {
    void props.reload();
  }, [props.reload]);

  const configHash = typeof props.configSnap?.hash === "string" ? props.configSnap.hash : null;

  // ── Mode switching ──

  const handleConnectionSelect = React.useCallback(
    (mode: "paid" | "self-managed") => {
      if ((mode === "paid") === isPaidMode) return;
      setConfirmModeSwitch(mode);
    },
    [isPaidMode]
  );

  const handleConfirmModeSwitch = React.useCallback(async () => {
    const direction = confirmModeSwitch;
    setConfirmModeSwitch(null);
    if (!direction) return;

    setModeSwitchBusy(true);
    try {
      if (direction === "paid") {
        await dispatch(switchToSubscription({ request: props.gw.request })).unwrap();
      } else {
        const result = await dispatch(switchToSelfManaged({ request: props.gw.request })).unwrap();
        if (!result.hasBackup) {
          props.onError("No saved configuration found. Please set up your API keys.");
        }
      }
      await dispatch(reloadConfig({ request: props.gw.request }));
      // Reset provider filter so it picks up the correct value from restored config
      state.setProviderFilter(null);
      autoSelectedRef.current = false;
    } catch (err) {
      addToastError(err);
    } finally {
      setModeSwitchBusy(false);
    }
  }, [confirmModeSwitch, dispatch, props, state.setProviderFilter]);

  return (
    <div className={s.root}>
      <div className={s.title}>Connection & AI Models</div>

      <ConnectionToggle
        isPaid={isPaidMode}
        disabled={modeSwitchBusy}
        onSelect={handleConnectionSelect}
      />

      {isPaidMode ? (
        <>
          <div className={s.dropdownGroup}>
            <div className={s.dropdownLabel}>Model</div>
            <RichSelect
              value={state.activeModelId ?? null}
              onChange={handleModelChange}
              options={modelOptions}
              placeholder={modelOptions.length === 0 ? "No models available" : "Select model…"}
              disabled={state.modelsLoading || state.modelBusy || modelOptions.length === 0}
            />
          </div>
          {modelOptions.length === 0 && !state.modelsLoading ? (
            <div className={s.noModelsHint}>
              No models loaded. Try restarting the app to refresh the model catalog.
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className={s.dropdownRow}>
            <div className={s.dropdownGroup}>
              <div className={s.dropdownLabel}>Provider</div>
              <RichSelect
                value={selectedProvider}
                onChange={handleProviderChange}
                options={providerOptions}
                placeholder="Select provider…"
                disabled={state.modelsLoading}
              />
            </div>
            <div className={s.dropdownGroup}>
              <div className={s.dropdownLabel}>Model</div>
              <RichSelect
                value={state.activeModelId ?? null}
                onChange={handleModelChange}
                options={modelOptions}
                placeholder={
                  !selectedProvider
                    ? "Select provider first"
                    : modelOptions.length === 0
                      ? "No models available"
                      : "Select model…"
                }
                disabled={
                  !selectedProvider ||
                  state.modelsLoading ||
                  state.modelBusy ||
                  modelOptions.length === 0
                }
              />
            </div>
          </div>
          {selectedProvider && modelOptions.length === 0 && !state.modelsLoading ? (
            <div className={s.noModelsHint}>
              {!isSelectedProviderConfigured
                ? "Add an API key below to load models for this provider."
                : "No models loaded. Try restarting the app to refresh the model catalog."}
            </div>
          ) : null}
        </>
      )}

      {/* Self-managed: inline API key entry */}
      {!isPaidMode && selectedProviderInfo ? (
        <InlineApiKey
          provider={selectedProviderInfo}
          configured={state.isProviderConfigured(selectedProvider!)}
          busy={state.busyProvider === selectedProvider}
          onSave={state.saveProviderApiKey}
          onSaveSetupToken={state.saveProviderSetupToken}
          onPaste={state.pasteFromClipboard}
          configHash={configHash}
          onOAuthSuccess={handleOAuthSuccess}
        />
      ) : null}

      {/* Paid: account / billing content */}
      {isPaidMode ? (
        <div className={s.paidAccountSection}>
          <AccountTab />
        </div>
      ) : null}

      {/* Mode switch confirmation modal */}
      <Modal
        open={confirmModeSwitch !== null}
        onClose={() => setConfirmModeSwitch(null)}
        header={
          confirmModeSwitch === "paid"
            ? "Switch to AtomicBot Subscription?"
            : "Switch to own API keys?"
        }
        aria-label="Confirm connection mode switch"
      >
        <p className={s.confirmDescription}>
          {confirmModeSwitch === "paid"
            ? "You won't need to manage API keys anymore. Your current configuration will be saved, and you can switch back at any time."
            : "You're about to switch to your own API keys. Your subscription will stay active but won't be used for AI requests."}
        </p>
        <div className={s.confirmActions}>
          <button
            type="button"
            className={s.confirmCancel}
            onClick={() => setConfirmModeSwitch(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.confirmAccept}
            onClick={() => void handleConfirmModeSwitch()}
          >
            {confirmModeSwitch === "paid" ? "Switch to subscription" : "Use own keys"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
