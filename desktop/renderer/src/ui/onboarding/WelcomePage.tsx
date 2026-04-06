import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAppSelector } from "@store/hooks";
import type { GatewayState } from "@main/types";
import { routes } from "../app/routes";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { ApiKeyPage } from "./providers/ApiKeyPage";
import { OAuthProviderPage } from "./providers/OAuthProviderPage";
import { OllamaSetupPage } from "./providers/OllamaSetupPage";
import { SetupModePage } from "./providers/SetupModePage";
import { ModelSelectPage } from "./providers/ModelSelectPage";
import { ProviderSelectPage } from "./providers/ProviderSelectPage";
import { RestoreOptionPage } from "./RestoreOptionPage";
import { RestoreFilePage } from "./RestoreFilePage";
import { useWelcomeState } from "./hooks/useWelcomeState";
import { SELF_FLOW, RESTORE_FLOW } from "./hooks/onboardingSteps";
import { OnboardingFlowContext } from "./hooks/onboarding-flow-context";
import { resolveModelSelectBackTarget } from "./hooks/resolve-model-select-back-target";
import { renderSharedFlowRoutes } from "./SharedFlowRoutes";

function WelcomeAutoStart(props: {
  startBusy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const { startBusy, error, onStart } = props;
  const didStartRef = React.useRef(false);

  React.useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    onStart();
  }, [onStart]);

  if (startBusy) {
    return null;
  }

  if (error) {
    return (
      <HeroPageLayout title="WELCOME" variant="compact" align="center" aria-label="Welcome setup">
        <GlassCard className="UiGlassCard-intro">
          <div className="UiIntroInner">
            <div className="UiSectionTitle">Setup failed.</div>
            <div className="UiSectionSubtitle">Please retry to continue onboarding.</div>
            <PrimaryButton onClick={onStart}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return null;
}

export function WelcomePage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const navigate = useNavigate();
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const welcome = useWelcomeState({ state, navigate });

  React.useEffect(() => {
    if (onboarded) {
      void navigate("/chat", { replace: true });
    }
  }, [navigate, onboarded]);

  // ── Flow values ──
  const steps = SELF_FLOW;
  const fs = welcome;
  const flowStatus = welcome.status;
  const flowError = welcome.error;
  const finishWelcome = welcome.finish;

  const skillsOnBack = welcome.goModelSelect;
  const connectionsFinish = finishWelcome;

  const goMediaUnderstanding = welcome.goMediaUnderstanding;
  const goObsidianConnect = welcome.goObsidian;
  const goSlackFromSkills = welcome.goSlackFromSkills;
  const goSlackFromConnections = welcome.goSlackFromConnections;
  const goSlackBack = welcome.goSlackBack;
  const selfManagedModelSelectBack =
    resolveModelSelectBackTarget(welcome.selectedProvider) === "ollama-setup"
      ? welcome.goOllamaSetup
      : welcome.goApiKey;
  const selfManagedModelSelectRetry =
    welcome.selectedProvider === "ollama" ? welcome.retryOllamaSubmit : welcome.loadModels;

  return (
    <OnboardingFlowContext.Provider value="self-managed">
      <Routes>
        <Route
          index
          element={
            <WelcomeAutoStart
              startBusy={welcome.startBusy}
              error={welcome.error}
              onStart={() => {
                void welcome.start();
              }}
            />
          }
        />

        {/* ── Setup mode selection (self-managed only) ── */}
        <Route
          path="setup-mode"
          element={
            <SetupModePage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.auth}
              onSelect={() => {
                welcome.goProviderSelect();
              }}
              onBack={() => void navigate(routes.consent)}
            />
          }
        />

        {/* ── Self-managed routes ── */}
        <Route
          path="provider-select"
          element={
            <ProviderSelectPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.provider}
              selectedProvider={welcome.selectedProvider}
              error={welcome.error}
              onSelect={welcome.onProviderSelect}
              onBack={() => void navigate(`${routes.welcome}/setup-mode`)}
              onSkip={welcome.goSkills}
            />
          }
        />

        <Route
          path="api-key"
          element={
            welcome.selectedProvider ? (
              <ApiKeyPage
                totalSteps={SELF_FLOW.totalSteps}
                activeStep={SELF_FLOW.steps.apiKey}
                provider={welcome.selectedProvider}
                status={welcome.status}
                error={welcome.error}
                busy={welcome.apiKeyBusy}
                onSubmit={welcome.onApiKeySubmit}
                onSubmitSetupToken={(token) => void welcome.onSetupTokenSubmit(token)}
                onBack={welcome.goProviderSelect}
              />
            ) : (
              <Navigate to={`${routes.welcome}/provider-select`} replace />
            )
          }
        />

        <Route
          path="oauth-provider"
          element={
            welcome.selectedProvider ? (
              <OAuthProviderPage
                totalSteps={SELF_FLOW.totalSteps}
                activeStep={SELF_FLOW.steps.apiKey}
                provider={welcome.selectedProvider}
                onSuccess={(profileId) => void welcome.onOAuthSuccess(profileId)}
                onBack={welcome.goProviderSelect}
              />
            ) : (
              <Navigate to={`${routes.welcome}/provider-select`} replace />
            )
          }
        />

        <Route
          path="ollama-setup"
          element={
            <OllamaSetupPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.apiKey}
              busy={welcome.apiKeyBusy}
              error={welcome.error}
              onSubmit={(params) => void welcome.onOllamaSubmit(params)}
              onBack={welcome.goProviderSelect}
            />
          }
        />

        <Route
          path="model-select"
          element={
            <ModelSelectPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.model}
              models={welcome.models}
              filterProvider={welcome.selectedProvider ?? undefined}
              loading={welcome.modelsLoading}
              error={welcome.modelsError}
              onSelect={(modelId) => void welcome.onModelSelect(modelId)}
              onBack={selfManagedModelSelectBack}
              onRetry={() => void selfManagedModelSelectRetry()}
              onSkip={welcome.goSkills}
            />
          }
        />

        {/* ── Unified shared routes (skills, connections, skill subpages) ── */}
        {renderSharedFlowRoutes({
          fs,
          steps,
          flowStatus,
          flowError,
          nav: {
            goSkills: welcome.goSkills,
            goConnections: welcome.goConnections,
            goWebSearch: welcome.goWebSearch,
            goNotion: welcome.goNotion,
            goTrello: welcome.goTrello,
            goGitHub: welcome.goGitHub,
            goAppleNotes: welcome.goAppleNotes,
            goAppleReminders: welcome.goAppleReminders,
            goGogGoogleWorkspace: welcome.goGogGoogleWorkspace,
            goTelegramToken: welcome.goTelegramToken,
            goMediaUnderstanding,
            goObsidianConnect,
            goSlackFromSkills,
            goSlackFromConnections,
            goSlackBack,
            skillsOnBack,
            connectionsFinish,
          },
        })}

        <Route
          path="restore"
          element={
            <RestoreOptionPage
              totalSteps={RESTORE_FLOW.totalSteps}
              activeStep={RESTORE_FLOW.steps.option}
            />
          }
        />
        <Route
          path="restore-file"
          element={
            <RestoreFilePage
              totalSteps={RESTORE_FLOW.totalSteps}
              activeStep={RESTORE_FLOW.steps.file}
            />
          }
        />

        <Route path="*" element={<Navigate to={routes.welcome} replace />} />
      </Routes>
    </OnboardingFlowContext.Provider>
  );
}
