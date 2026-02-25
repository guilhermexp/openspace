import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton } from "@shared/kit";

import s from "./SetupModePage.module.css";

export type SetupModeChoice = "paid" | "self-managed";

export function SetupModePage(props: {
  onSelect: (mode: SetupModeChoice) => void;
  onStartGoogleAuth?: () => void;
  authBusy?: boolean;
  authError?: string | null;
  onBack?: () => void;
}) {
  const [selected, setSelected] = React.useState<SetupModeChoice>("paid");
  const totalSteps = 4;
  const activeStep = 0;

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup mode selection">
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupModeCard}`}>
        <div className="UiOnboardingDots" aria-label="Onboarding progress">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <span
              key={idx}
              className={`UiOnboardingDot ${idx === activeStep ? "UiOnboardingDot--active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="UiSectionTitle">Choose option to set up</div>
        <div className="UiSectionSubtitle">
          Choose how you want to set up your OpenClaw. You can change configuration later.
        </div>

        <div className={s.UiSetupModeOptions}>
          <button
            type="button"
            className={`${s.UiSetupModeOption} ${selected === "paid" ? s.UiSetupModeOptionSelected : ""}`}
            onClick={() => setSelected("paid")}
          >
            <div className={s.UiSetupModeIcon}>✦</div>
            <span className={s.UiSetupModeBadge}>Popular 🔥</span>
            <div className={s.UiSetupModeTitle}>Do everything for me</div>
            <div className={s.UiSetupModeDesc}>Billed monthly</div>
            <ul className={s.UiSetupModeFeatures}>
              <li>One-click setup with Google</li>
              <li>No API keys needed</li>
              <li>Auto credit management</li>
            </ul>
            <PrimaryButton
              size="sm"
              disabled={props.authBusy}
              loading={props.authBusy}
              onClick={() => {
                if (props.onStartGoogleAuth) {
                  props.onStartGoogleAuth();
                } else {
                  props.onSelect("paid");
                }
              }}
            >
              Continue with Google
            </PrimaryButton>
            {props.authError ? <div className="UiErrorText">{props.authError}</div> : null}
          </button>

          <button
            type="button"
            className={`${s.UiSetupModeOption} ${selected === "self-managed" ? s.UiSetupModeOptionSelected : ""}`}
            onClick={() => setSelected("self-managed")}
          >
            <div className={s.UiSetupModeIcon}>🖱</div>
            <div className={s.UiSetupModeTitle}>Manual setup</div>
            <div className={s.UiSetupModeDesc}>Free with your own API Keys</div>
            <ul className={s.UiSetupModeFeatures}>
              <li>Use your own provider keys</li>
              <li>Full model provider choice</li>
              <li>No payment required</li>
            </ul>
            <SecondaryButton size="sm" onClick={() => props.onSelect("self-managed")}>
              Continue with API key
            </SecondaryButton>
          </button>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
