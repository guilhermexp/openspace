/**
 * "AI Models" settings tab.
 * Shows Provider/Model selectors and inline API key entry.
 */
import React from "react";

import type { ConfigData } from "@store/slices/configSlice";

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_BY_ID,
  type ModelProvider,
  resolveProviderIconUrl,
  getProviderIconUrl,
} from "@shared/models/providers";
import { getModelTier, formatModelMeta, TIER_INFO } from "@shared/models/modelPresentation";
import { useModelProvidersState } from "../providers/useModelProvidersState";
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
  if (p.localModels) return { text: "Local models", variant: "local" };
  if (p.privacyFirst) return { text: "Privacy First", variant: "privacy" };
  return undefined;
}

export function AccountModelsTab(props: {
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
  noTitle?: boolean;
}) {
  const { gw, reload, onError, configSnap, noTitle } = props;

  const state = useModelProvidersState(props);
  const {
    activeProviderKey,
    providerFilter,
    setProviderFilter,
    sortedModels,
    saveDefaultModel,
    activeModelId,
    isProviderConfigured,
    modelsLoading,
    modelBusy,
    busyProvider,
    saveProviderApiKey,
    saveProviderSetupToken,
    saveOllamaProvider,
    loadModels,
    pasteFromClipboard,
  } = state;

  // Auto-select provider from current active model on first load
  const autoSelectedRef = React.useRef(false);
  const selectedProvider = providerFilter;
  const selectedProviderInfo = selectedProvider
    ? (MODEL_PROVIDER_BY_ID[selectedProvider] ?? null)
    : null;

  React.useEffect(() => {
    if (!autoSelectedRef.current && !!activeProviderKey && !providerFilter) {
      autoSelectedRef.current = true;
      setProviderFilter(activeProviderKey);
    }
  }, [activeProviderKey, providerFilter, setProviderFilter]);

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
    if (!selectedProvider) return [];
    return sortedModels
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
          icon: getProviderIconUrl(m.provider),
        };
      });
  }, [selectedProvider, sortedModels]);

  const handleProviderChange = React.useCallback(
    (value: ModelProvider) => {
      setProviderFilter(value);
    },
    [setProviderFilter]
  );

  const handleModelChange = React.useCallback(
    (value: string) => {
      void saveDefaultModel(value);
    },
    [saveDefaultModel]
  );

  // Auto-select first model when provider changes and current model doesn't belong to it
  React.useEffect(() => {
    if (
      selectedProvider &&
      modelOptions.length > 0 &&
      !modelOptions.some((opt) => opt.value === activeModelId)
    ) {
      handleModelChange(modelOptions[0]!.value);
    }
  }, [activeModelId, handleModelChange, modelOptions, selectedProvider]);

  const handleOAuthSuccess = React.useCallback(() => {
    void reload();
  }, [reload]);

  const configHash = typeof configSnap?.hash === "string" ? configSnap.hash : null;

  return (
    <div className={s.root}>
      {!noTitle && <div className={s.title}>AI Models</div>}

      <div className="fade-in">
        <div className={s.dropdownRow}>
          <div className={s.dropdownGroup}>
            <div className={s.dropdownLabel}>Provider</div>
            <RichSelect
              value={selectedProvider}
              onChange={handleProviderChange}
              options={providerOptions}
              placeholder="Select provider…"
            />
          </div>
          <div className={s.dropdownGroup}>
            <div className={s.dropdownLabel}>Model</div>
            <RichSelect
              value={activeModelId ?? null}
              onChange={handleModelChange}
              options={modelOptions}
              placeholder={
                !selectedProvider
                  ? "Select provider first"
                  : modelOptions.length === 0
                    ? "Enter API key to choose a model"
                    : "Select model…"
              }
              disabled={
                !selectedProvider || modelsLoading || modelBusy || modelOptions.length === 0
              }
              disabledStyles={!selectedProvider || modelOptions.length === 0}
              onlySelectedIcon
            />
          </div>
        </div>

        {selectedProvider && modelOptions.length === 0 && !modelsLoading && (
          <div className={s.noModelsHint}>
            {!isSelectedProviderConfigured
              ? "Add an API key below to load models for this provider."
              : "No models loaded. Try restarting the app to refresh the model catalog."}
          </div>
        )}

        {/* Inline API key entry */}
        {selectedProviderInfo && (
          <InlineApiKey
            provider={selectedProviderInfo}
            configured={isProviderConfigured(selectedProvider!)}
            busy={busyProvider === selectedProvider}
            onSave={saveProviderApiKey}
            onSaveSetupToken={saveProviderSetupToken}
            onSaveOllama={saveOllamaProvider}
            onRefreshModels={loadModels}
            onPaste={pasteFromClipboard}
            configHash={configHash}
            onOAuthSuccess={handleOAuthSuccess}
          />
        )}
      </div>
    </div>
  );
}
