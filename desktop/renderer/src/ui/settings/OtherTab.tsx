import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { optInRenderer, optOutRenderer, getCurrentUserId } from "@analytics";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { authActions, clearAuth, persistMode } from "@store/slices/auth/authSlice";
import { errorToMessage } from "@shared/toast";
import { ConfirmDialog } from "@shared/kit";
import { releaseGithubRepoUrl } from "@shared/github-release-config";
import { routes } from "../app/routes";
import { settingsStyles as ps } from "./SettingsPage";
import { openExternal } from "@shared/utils/openExternal";
import { useTerminalSidebarVisible } from "@shared/hooks/useTerminalSidebarVisible";
import { useActionLogCollapsedByDefault } from "@shared/hooks/useActionLogCollapsedByDefault";
import { RestoreBackupModal } from "./RestoreBackupModal";
import s from "./OtherTab.module.css";
import pkg from "../../../../package.json";

type SecurityLevel = "balanced" | "permissive";
type ControlUiBootstrapConfig = {
  serverVersion?: string;
};
type OpenclawRuntimeInfo = {
  runtime: "bundled" | "dev-checkout";
  updateSupported: boolean;
  reason: string | null;
};
type AppUpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string | null }
  | { kind: "ready"; version: string };

type ExecApprovalsFile = {
  version: 1;
  socket?: { path?: string; token?: string };
  defaults?: {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
  };
  agents?: Record<
    string,
    {
      security?: string;
      ask?: string;
      askFallback?: string;
      autoAllowSkills?: boolean;
      allowlist?: { pattern: string }[];
    }
  >;
};

type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: ExecApprovalsFile;
};

function deriveSecurityLevel(file: ExecApprovalsFile): SecurityLevel {
  const security = file.defaults?.security ?? "allowlist";
  const ask = file.defaults?.ask ?? "on-miss";
  if (security === "full" && ask === "off") return "permissive";
  return "balanced";
}

function applySecurityLevel(file: ExecApprovalsFile, level: SecurityLevel): ExecApprovalsFile {
  const defaults = { ...file.defaults };
  switch (level) {
    case "balanced":
      defaults.security = "allowlist";
      defaults.ask = "on-miss";
      defaults.autoAllowSkills = true;
      break;
    case "permissive":
      defaults.security = "full";
      defaults.ask = "off";
      break;
  }
  return { ...file, defaults };
}

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const [openclawVersion, setOpenclawVersion] = React.useState<string | null>(null);
  const [openclawRuntimeInfo, setOpenclawRuntimeInfo] = React.useState<OpenclawRuntimeInfo | null>(
    null
  );
  const [openclawUpdateBusy, setOpenclawUpdateBusy] = React.useState(false);
  const [appUpdatePhase, setAppUpdatePhase] = React.useState<AppUpdatePhase>({ kind: "idle" });
  const [appUpdateInstalling, setAppUpdateInstalling] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [terminalSidebar, setTerminalSidebar] = useTerminalSidebarVisible();
  const [actionLogCollapsedByDefault, setActionLogCollapsedByDefault] =
    useActionLogCollapsedByDefault();
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const [securityLevel, setSecurityLevel] = React.useState<SecurityLevel>("balanced");
  const [securityBusy, setSecurityBusy] = React.useState(false);
  const approvalsRef = React.useRef<ExecApprovalsSnapshot | null>(null);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const authMode = useAppSelector((st) => st.auth.mode);

  const appVersion = pkg.version || "0.0.0";

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getLaunchAtLogin) {
      return;
    }
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
  }, []);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.analyticsGet) {
      return;
    }
    void api.analyticsGet().then((res) => setAnalyticsEnabled(res.enabled));
  }, []);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getOpenclawRuntimeInfo) {
      return;
    }
    let cancelled = false;
    void api
      .getOpenclawRuntimeInfo()
      .then((info) => {
        if (!cancelled) {
          setOpenclawRuntimeInfo(info);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenclawRuntimeInfo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onUpdateAvailable) {
      return;
    }

    const unsubs = [
      api.onUpdateAvailable((payload) => {
        setAppUpdateInstalling(false);
        setAppUpdatePhase({ kind: "available", version: payload.version });
      }),
      api.onUpdateDownloadProgress(() => {
        setAppUpdatePhase((prev) => {
          const version =
            prev.kind === "available" || prev.kind === "downloading" || prev.kind === "ready"
              ? prev.version
              : null;
          return { kind: "downloading", version };
        });
      }),
      api.onUpdateDownloaded((payload) => {
        setAppUpdateInstalling(false);
        setAppUpdatePhase({ kind: "ready", version: payload.version });
      }),
      api.onUpdateError((payload) => {
        setAppUpdateInstalling(false);
        onError(payload.message);
        setAppUpdatePhase((prev) => {
          if (prev.kind === "downloading" && prev.version) {
            return { kind: "available", version: prev.version };
          }
          if (prev.kind === "checking") {
            return { kind: "idle" };
          }
          return prev;
        });
      }),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [onError]);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getGatewayInfo) {
      return;
    }
    let cancelled = false;
    void api
      .getGatewayInfo()
      .then(async (info) => {
        const gatewayState = info.state;
        if (cancelled || gatewayState?.kind !== "ready") {
          return;
        }
        const baseUrl = gatewayState.url.endsWith("/") ? gatewayState.url : `${gatewayState.url}/`;
        const bootstrapUrl = new URL("__openclaw/control-ui-config.json", baseUrl).toString();
        const response = await fetch(bootstrapUrl);
        if (!response.ok) {
          throw new Error(`Failed to load OpenClaw version (${response.status})`);
        }
        const payload = (await response.json()) as ControlUiBootstrapConfig;
        const version =
          typeof payload.serverVersion === "string" && payload.serverVersion.trim()
            ? payload.serverVersion.trim()
            : null;
        if (!cancelled) {
          setOpenclawVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenclawVersion(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!gw.connected) return;
    void gw
      .request<ExecApprovalsSnapshot>("exec.approvals.get", {})
      .then((snap) => {
        approvalsRef.current = snap;
        setSecurityLevel(deriveSecurityLevel(snap.file));
      })
      .catch(() => {});
  }, [gw, gw.connected]);

  const toggleAnalytics = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.analyticsSet) {
        onError("Desktop API not available");
        return;
      }
      setAnalyticsEnabled(enabled);
      try {
        await api.analyticsSet(enabled);
        const userId = getCurrentUserId();
        if (enabled && userId) {
          optInRenderer(userId);
        } else {
          optOutRenderer();
        }
      } catch (err) {
        setAnalyticsEnabled(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError]
  );

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.setLaunchAtLogin) {
        onError("Desktop API not available");
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        setLaunchAtStartup(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError]
  );

  const handleSecurityLevelChange = React.useCallback(
    async (level: SecurityLevel) => {
      const prev = securityLevel;
      setSecurityLevel(level);
      setSecurityBusy(true);
      onError(null);
      try {
        const snap = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        approvalsRef.current = snap;
        const nextFile = applySecurityLevel(snap.file, level);
        await gw.request("exec.approvals.set", {
          baseHash: snap.hash,
          file: nextFile,
        });
        approvalsRef.current = { ...snap, file: nextFile };
      } catch (err) {
        setSecurityLevel(prev);
        onError(errorToMessage(err));
      } finally {
        setSecurityBusy(false);
      }
    },
    [gw, onError, securityLevel]
  );

  const confirmResetAndClose = React.useCallback(async () => {
    setResetConfirmOpen(false);
    const api = getDesktopApiOrNull();
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(errorToMessage(err));
      setResetBusy(false);
    }
  }, [onError]);

  const handleOpenclawUpdate = React.useCallback(async () => {
    if (!openclawRuntimeInfo?.updateSupported) {
      return;
    }
    onError(null);
    setOpenclawUpdateBusy(true);
    try {
      await gw.request("update.run", {});
    } catch (err) {
      onError(errorToMessage(err));
    } finally {
      setOpenclawUpdateBusy(false);
    }
  }, [gw, onError, openclawRuntimeInfo?.updateSupported]);

  const handleCreateBackup = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.createBackup) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setBackupBusy(true);
    try {
      const result = await api.createBackup(authMode ?? undefined);
      if (!result.ok && !result.cancelled) {
        onError(result.error || "Failed to create backup");
      }
    } catch (err) {
      onError(errorToMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }, [onError, authMode]);

  const handleCheckAppUpdate = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    const checkForUpdates = api?.checkForUpdates ?? api?.checkForUpdate;
    if (!checkForUpdates) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setAppUpdateInstalling(false);
    setAppUpdatePhase({ kind: "checking" });
    try {
      await checkForUpdates();
      setAppUpdatePhase((prev) => (prev.kind === "checking" ? { kind: "idle" } : prev));
    } catch (err) {
      setAppUpdatePhase({ kind: "idle" });
      onError(errorToMessage(err));
    }
  }, [onError]);

  const handleDownloadAppUpdate = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.downloadUpdate) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setAppUpdateInstalling(false);
    setAppUpdatePhase((prev) => {
      if (prev.kind === "available") {
        return { kind: "downloading", version: prev.version };
      }
      return { kind: "downloading", version: null };
    });
    try {
      await api.downloadUpdate();
    } catch (err) {
      setAppUpdatePhase((prev) => {
        if (prev.kind === "downloading" && prev.version) {
          return { kind: "available", version: prev.version };
        }
        return { kind: "idle" };
      });
      onError(errorToMessage(err));
    }
  }, [onError]);

  const handleInstallAppUpdate = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.installUpdate) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setAppUpdateInstalling(true);
    try {
      await api.installUpdate();
    } catch (err) {
      setAppUpdateInstalling(false);
      onError(errorToMessage(err));
    }
  }, [onError]);

  const handleRestored = React.useCallback(
    (meta?: { mode?: string }) => {
      dispatch(authActions.clearAuthState());
      void dispatch(clearAuth());

      const restoredMode =
        meta?.mode === "paid" || meta?.mode === "self-managed" ? meta.mode : "self-managed";
      dispatch(authActions.setMode(restoredMode));
      persistMode(restoredMode);

      setRestoreModalOpen(false);
      if (restoredMode === "paid") {
        navigate(`${routes.settings}/account`);
      } else {
        navigate(routes.chat);
      }
    },
    [navigate, dispatch]
  );

  const api = getDesktopApiOrNull();

  return (
    <div className={ps.UiSettingsContentInner}>
      {/* App & About (combined) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>App</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Version</span>
            <span className={s.UiSettingsOtherAppRowValue}>OpenSpace v{appVersion}</span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <div className={s.UiSettingsOtherRowLabelGroup}>
              <span className={s.UiSettingsOtherRowLabel}>App update</span>
              <span className={s.UiSettingsOtherRowSubLabel}>
                Check and install OpenSpace desktop updates
              </span>
            </div>
            {appUpdatePhase.kind === "checking" ? (
              <button type="button" className={s.UiSettingsOtherLink} disabled>
                Checking...
              </button>
            ) : null}
            {appUpdatePhase.kind === "idle" ? (
              <button
                type="button"
                className={s.UiSettingsOtherLink}
                onClick={() => void handleCheckAppUpdate()}
              >
                Check for updates
              </button>
            ) : null}
            {appUpdatePhase.kind === "available" ? (
              <button
                type="button"
                className={s.UiSettingsOtherLink}
                onClick={() => void handleDownloadAppUpdate()}
              >
                Download v{appUpdatePhase.version}
              </button>
            ) : null}
            {appUpdatePhase.kind === "downloading" ? (
              <button type="button" className={s.UiSettingsOtherLink} disabled>
                Downloading...
              </button>
            ) : null}
            {appUpdatePhase.kind === "ready" ? (
              <button
                type="button"
                className={s.UiSettingsOtherLink}
                disabled={appUpdateInstalling}
                onClick={() => void handleInstallAppUpdate()}
              >
                Restart & Update
              </button>
            ) : null}
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>OpenClaw version</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              {openclawVersion ? `v${openclawVersion}` : "Unavailable"}
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <div className={s.UiSettingsOtherRowLabelGroup}>
              <span className={s.UiSettingsOtherRowLabel}>OpenClaw update</span>
              <span className={s.UiSettingsOtherRowSubLabel}>
                {openclawRuntimeInfo?.reason ??
                  "Checks and installs the current OpenClaw runtime when supported."}
              </span>
            </div>
            {openclawRuntimeInfo?.updateSupported ? (
              <button
                type="button"
                className={s.UiSettingsOtherLink}
                disabled={openclawUpdateBusy}
                onClick={() => void handleOpenclawUpdate()}
              >
                {openclawUpdateBusy ? "Updating..." : "Update now"}
              </button>
            ) : (
              <button type="button" className={s.UiSettingsOtherLink} disabled>
                Managed by app
              </button>
            )}
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Auto start</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Support</span>
            <a href="mailto:support@openspace.dev" className={s.UiSettingsOtherLink}>
              support@openspace.dev
            </a>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.legacy} className={s.UiSettingsOtherLink}>
              Legacy UI Dashboard
            </NavLink>
          </div>
        </div>
        <div className={s.UiSettingsOtherLinksRow}>
          <span className={s.UiSettingsOtherFooterCopy}>
            &copy; {new Date().getFullYear()} OpenSpace
          </span>
          {releaseGithubRepoUrl ? (
            <button
              type="button"
              className={s.UiSettingsOtherFooterLink}
              onClick={() => openExternal(releaseGithubRepoUrl)}
            >
              GitHub
            </button>
          ) : null}
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://openspace.dev")}
          >
            Website
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://x.com/openspace_dev")}
          >
            X
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://www.instagram.com/openspace.dev/")}
          >
            Instagram
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://discord.gg/2TXafRV69m")}
          >
            Discord
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://openspace.dev/privacy-policy")}
          >
            Privacy Policy
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Backup</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Create backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              disabled={backupBusy}
              onClick={() => void handleCreateBackup()}
            >
              {backupBusy ? "Creating..." : "Save to file"}
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Restore from backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => setRestoreModalOpen(true)}
            >
              Choose file
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Create a full backup of your OpenSpace configuration or restore from a previously saved
          backup.
        </p>
      </section>

      <RestoreBackupModal
        open={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestored={handleRestored}
      />

      {/* Folders: app data + Agent workspace */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Folders</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>App data folder</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openOpenclawFolder()}
            >
              Open folder
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Agent workspace</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Contains your local OpenSpace state and app data. Workspace contains editable .md files
          (AGENTS, SOUL, USER, IDENTITY, TOOLS, HEARTBEAT, BOOTSTRAP) that shape the agent.
        </p>
      </section>

      {/* Terminal */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Terminal</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Show in sidebar</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Show terminal in sidebar">
                <input
                  type="checkbox"
                  checked={terminalSidebar}
                  onChange={(e) => setTerminalSidebar(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.terminal} className={s.UiSettingsOtherLink}>
              Open Terminal
            </NavLink>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Built-in terminal with bundled agent tools available in PATH.
        </p>
      </section>

      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Chat</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <div className={s.UiSettingsOtherRowLabelGroup}>
              <span className={s.UiSettingsOtherRowLabel}>Collapse action logs by default</span>
              <span className={s.UiSettingsOtherRowSubLabel}>
                Start interaction logs collapsed instead of expanded.
              </span>
            </div>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle}>
                <input
                  type="checkbox"
                  aria-label="Collapse action logs by default"
                  checked={actionLogCollapsedByDefault}
                  onChange={(e) => setActionLogCollapsedByDefault(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          You can still expand or collapse each log manually inside the conversation.
        </p>
      </section>

      {/* Agent: exec approval security level */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Agent</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <div className={s.UiSettingsOtherRowLabelGroup}>
              <span className={s.UiSettingsOtherRowLabel}>Command approval</span>
              <span className={s.UiSettingsOtherRowSubLabel}>
                Controls when shell commands require your approval
              </span>
            </div>
            <select
              className={s.UiSettingsOtherSelect}
              value={securityLevel}
              disabled={securityBusy}
              onChange={(e) => void handleSecurityLevelChange(e.target.value as SecurityLevel)}
            >
              <option value="balanced">Balanced</option>
              <option value="permissive">Permissive</option>
            </select>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          <strong>Balanced</strong> — approve only unknown commands. <strong>Permissive</strong> —
          no approvals needed.
        </p>
      </section>

      {/* Privacy */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Privacy</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Anonymous statistics</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Share anonymous usage data">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => void toggleAnalytics(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
        </div>
      </section>

      {/* Danger zone (reset) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Account</h3>
        <p className={s.UiSettingsOtherDangerSubtitle}>
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will restart.
        </p>
        <div className={`${s.UiSettingsOtherCard} ${s["UiSettingsOtherCard--danger"]}`}>
          <div className={s.UiSettingsOtherRow}>
            <button
              type="button"
              className={s.UiSettingsOtherDangerButton}
              disabled={resetBusy}
              onClick={() => setResetConfirmOpen(true)}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset and sign out?"
        subtitle="All local data will be deleted and Google Workspace will be disconnected. The app will close and you'll need to set it up again."
        confirmLabel="Reset"
        danger
        onConfirm={() => void confirmResetAndClose()}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
