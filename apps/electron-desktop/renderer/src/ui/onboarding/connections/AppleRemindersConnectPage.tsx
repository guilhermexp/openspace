import React from "react";

import {
  GlassCard,
  HeroPageLayout,
  OnboardingDots,
  PrimaryButton,
  SecondaryButton,
} from "@shared/kit";

export function AppleRemindersConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onAuthorizeAndEnable: () => void;
  onBack: () => void;
}) {
  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Apple Reminders setup">
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

        <div className="UiApiKeyTitle">Connect Apple Reminders</div>
        <div className="UiApiKeySubtitle">
          Enable Reminders access via the bundled remindctl CLI.
        </div>

        <div className="UiSectionSubtitle">
          Notes:
          <ol>
            <li>macOS may prompt you to grant Automation access to Reminders.app.</li>
            <li>
              If you deny access, Reminders actions will fail until you re-enable permissions in
              System Settings.
            </li>
          </ol>
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <button
            className="UiTextButton"
            disabled={props.busy}
            onClick={props.onBack}
            type="button"
          >
            Back
          </button>
          <div className="flex-row-center">
            <PrimaryButton size={"sm"} disabled={props.busy} onClick={props.onAuthorizeAndEnable}>
              Connect
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
