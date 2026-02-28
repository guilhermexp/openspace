import React from "react";

import {
  GlassCard,
  HeroPageLayout,
  OnboardingDots,
  PrimaryButton,
  SecondaryButton,
} from "@shared/kit";

import s from "./SetupModePage.module.css";
import logoIcon from "@assets/icon-sm.png";
import cursorIcon from "@assets/сursor.svg";
import googleIcon from "@assets/set-up-skills/Google.svg";

export type SetupModeChoice = "paid" | "self-managed";

export function SetupModePage(props: {
  totalSteps: number;
  activeStep: number;
  onSelect: (mode: SetupModeChoice) => void;
  onStartGoogleAuth?: () => void;
  authBusy?: boolean;
  authError?: string | null;
  onBack?: () => void;
}) {
  const [selected, setSelected] = React.useState<SetupModeChoice>("paid");

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup mode selection">
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupModeCard}`}>
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

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
            <div className={s.UiSetupModeIconRow}>
              <div className={s.UiSetupModeIcon}>
                <img src={logoIcon} alt="" width={35} height={35} />
              </div>
              <span className={s.UiSetupModeBadge}>Popular 🔥</span>
            </div>
            <div className={s.UiSetupModeTitle}>Do everything for me</div>
            <div className={s.UiSetupModeDesc}>Billed monthly</div>
            <ul className={s.UiSetupModeFeatures}>
              <li>One-click setup with Google</li>
              <li>No API keys needed</li>
              <li>Auto credit management</li>
            </ul>
            <PrimaryButton
              size="sm"
              className={s.UiGoogleButton}
              disabled={props.authBusy}
              onClick={() => {
                if (props.onStartGoogleAuth) {
                  props.onStartGoogleAuth();
                } else {
                  props.onSelect("paid");
                }
              }}
            >
              {props.authBusy ? (
                <span className={`UiButtonSpinner ${s.UiGoogleButtonSpinner}`} aria-hidden="true" />
              ) : (
                <img src={googleIcon} alt="" width={18} height={18} />
              )}
              Continue with Google
            </PrimaryButton>
            {props.authError ? <div className="UiErrorText">{props.authError}</div> : null}
          </button>

          <button
            type="button"
            className={`${s.UiSetupModeOption} ${selected === "self-managed" ? s.UiSetupModeOptionSelected : ""}`}
            onClick={() => setSelected("self-managed")}
          >
            <div className={s.UiSetupModeIcon}>
              <img src={cursorIcon} alt="" width={35} height={35} />
            </div>
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
