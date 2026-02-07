import React from "react";
import { NavLink } from "react-router-dom";
import { ActionButton, ButtonRow } from "../kit";
import { routes } from "../routes";

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [signOutBusy, setSignOutBusy] = React.useState(false);

  const appVersion =
    typeof window !== "undefined" && window.openclawDesktop?.version
      ? window.openclawDesktop.version
      : "0.0.0";

  const signOut = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "Sign out will reset the app's local state and remove authorizations. Continue?"
    );
    if (!ok) return;
    onError(null);
    setSignOutBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(String(err));
      setSignOutBusy(false);
    }
  }, [onError]);

  return (
    <div className="UiSettingsContentInner">
      <div className="UiSettingsTabTitle">Other</div>

      <section className="UiSettingsSection">
        <div className="UiSectionTitle">About</div>
        <div className="UiSettingsRow">
          <span className="UiSettingsRowLabel">App</span>
          <span className="UiSettingsRowValue">Atomic Bot v{appVersion}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <NavLink to={routes.legacy} className="UiLink">
            Legacy
          </NavLink>
        </div>
      </section>

      <section className="UiSettingsSection">
        <div className="UiSectionTitle">General</div>
        <div className="UiSettingsRow">
          <span className="UiSettingsRowLabel">Launch at startup</span>
          <label className="UiToggle" aria-label="Launch at startup">
            <input
              type="checkbox"
              checked={launchAtStartup}
              onChange={(e) => setLaunchAtStartup(e.target.checked)}
            />
            <span className="UiToggleTrack">
              <span className="UiToggleThumb" />
            </span>
          </label>
        </div>
      </section>

      <section className="UiSettingsSection UiSettingsSection--danger">
        <div className="UiSectionTitle">Account</div>
        <ButtonRow>
          <ActionButton
            className="UiSettingsSignOutButton"
            variant="primary"
            disabled={signOutBusy}
            onClick={() => void signOut()}
          >
            {signOutBusy ? "Signing out…" : "Sign Out"}
          </ActionButton>
        </ButtonRow>
      </section>
    </div>
  );
}
