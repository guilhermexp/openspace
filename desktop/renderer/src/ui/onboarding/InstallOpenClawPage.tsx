import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { FooterText, GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import type {
  OpenClawInstallResult,
  OpenClawInstallStatus,
} from "../../../../src/shared/desktop-bridge-contract";
import pkg from "../../../../package.json";

type InstallState = {
  busy: boolean;
  error: string | null;
  details: OpenClawInstallResult | null;
};

async function startGatewayIfInstalled(status: OpenClawInstallStatus): Promise<void> {
  if (!status.installed) {
    return;
  }
  const api = getDesktopApiOrNull();
  await api?.startGateway?.();
}

export function InstallOpenClawPage() {
  const [state, setState] = React.useState<InstallState>({
    busy: false,
    error: null,
    details: null,
  });
  const appVersion = pkg.version || "0.0.0";

  const checkInstalled = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.openclawCheckInstalled) {
      setState((current) => ({
        ...current,
        error: "Desktop API is not available. Please restart the app.",
      }));
      return;
    }

    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const status = await api.openclawCheckInstalled();
      await startGatewayIfInstalled(status);
      if (!status.installed) {
        setState((current) => ({ ...current, busy: false }));
      }
    } catch (err) {
      setState((current) => ({
        ...current,
        busy: false,
        error: errorToMessage(err),
      }));
    }
  }, []);

  React.useEffect(() => {
    void checkInstalled();
  }, [checkInstalled]);

  const install = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.openclawInstall) {
      setState((current) => ({
        ...current,
        error: "Desktop API is not available. Please restart the app.",
      }));
      return;
    }

    setState((current) => ({ ...current, busy: true, error: null, details: null }));
    try {
      const result = await api.openclawInstall();
      setState({ busy: false, error: result.ok ? null : result.stderr || null, details: result });
      if (result.ok && result.installed) {
        await startGatewayIfInstalled(result);
      }
    } catch (err) {
      setState((current) => ({
        ...current,
        busy: false,
        error: errorToMessage(err),
      }));
    }
  }, []);

  const manualDetails = state.details?.needsManualInstall ? state.details : null;

  return (
    <HeroPageLayout title="OPENCLAW" variant="compact" align="center" aria-label="Install OpenClaw">
      <GlassCard className="UiGlassCard-intro">
        <div className="UiIntroInner">
          <div className="UiSectionTitle">Install OpenClaw to continue</div>
          <div className="UiSectionSubtitle">
            OpenSpace now connects to a standalone OpenClaw runtime installed on your machine.
          </div>
          <PrimaryButton disabled={state.busy} onClick={() => void install()}>
            {state.busy ? "Installing..." : "Install"}
          </PrimaryButton>
          <button type="button" className="UiSecondaryButton" disabled={state.busy} onClick={() => void checkInstalled()}>
            I already installed it
          </button>
          {state.error ? <div className="UiErrorText">{state.error}</div> : null}
          {manualDetails ? (
            <div className="UiInfoText" style={{ textAlign: "left", width: "100%" }}>
              <div>Run these commands manually if the automatic install fails:</div>
              <pre>
                <code>{manualDetails.installCommand}</code>
              </pre>
              <pre>
                <code>{manualDetails.daemonCommand}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </GlassCard>
      <FooterText>Version {appVersion}</FooterText>
    </HeroPageLayout>
  );
}
