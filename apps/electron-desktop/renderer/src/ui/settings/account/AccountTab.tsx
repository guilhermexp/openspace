/**
 * Account / Billing tab for Settings.
 * Three states:
 *  1. paid + jwt  → balance dashboard
 *  2. paid + !jwt → sign-up prompt (Continue with Google)
 *  3. self-managed → fallback (tab should be hidden, but graceful)
 */
import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  storeAuthToken,
  switchToSubscription,
  applySubscriptionKeys,
  handleLogout,
  createAddonCheckout,
  fetchBalance,
} from "@store/slices/authSlice";
import { useGatewayRpc } from "@gateway/context";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi } from "@ipc/backendApi";
import { SecondaryButton, Modal } from "@shared/kit";
import { addToastError, addToast } from "@shared/toast";

import googleIcon from "@assets/set-up-skills/Google.svg";
import s from "./AccountTab.module.css";

function formatDollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AccountTab() {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const { mode, jwt, email, balance, topUpPending } = useAppSelector((st) => st.auth);
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [autoRefill, setAutoRefill] = React.useState(true);
  const [topUpAmount, setTopUpAmount] = React.useState("10.00");
  const [confirmLogoutOpen, setConfirmLogoutOpen] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    const unsub = api.onDeepLink((payload) => {
      if (payload.host === "auth" || payload.pathname === "/auth") {
        const { token, email: authEmail, userId, isNewUser } = payload.params;
        if (token && authEmail && userId) {
          void (async () => {
            await dispatch(
              storeAuthToken({
                jwt: token,
                email: decodeURIComponent(authEmail),
                userId,
                isNewUser: isNewUser === "true",
              })
            );
            await dispatch(switchToSubscription({ request: gw.request }));
            try {
              await dispatch(applySubscriptionKeys({ token, request: gw.request })).unwrap();
            } catch (err) {
              console.warn("[AccountTab] Failed to apply subscription keys:", err);
            }
          })();
        }
      } else if (payload.host === "addon-success") {
        void dispatch(fetchBalance());
        addToast("Balance updated!");
      }
    });

    return unsub;
  }, [dispatch, gw.request]);

  const handleManageSubscription = React.useCallback(async () => {
    if (!jwt) return;
    setPortalBusy(true);
    try {
      const result = await backendApi.getPortalUrl(jwt);
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.portalUrl);
      }
    } catch (err) {
      addToastError(err);
    } finally {
      setPortalBusy(false);
    }
  }, [jwt]);

  const onLogout = React.useCallback(() => {
    setConfirmLogoutOpen(true);
  }, []);

  const handleConfirmLogout = React.useCallback(async () => {
    setLogoutBusy(true);
    try {
      await dispatch(handleLogout({ request: gw.request })).unwrap();
      addToast("Logged out. Sign in again anytime.");
      setConfirmLogoutOpen(false);
    } catch (err) {
      addToastError(err);
    } finally {
      setLogoutBusy(false);
    }
  }, [dispatch, gw.request]);

  const handleContinueWithGoogle = React.useCallback(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
    const url = `${backendUrl}/auth/google/desktop`;
    const api = getDesktopApiOrNull();
    if (api?.openExternal) {
      void api.openExternal(url);
    }
  }, []);

  const handleTopUp = React.useCallback(async () => {
    const amount = Number.parseFloat(topUpAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      addToast("Enter a valid amount");
      return;
    }

    try {
      const result = await dispatch(createAddonCheckout({ amountUsd: amount })).unwrap();
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      } else {
        window.open(result.checkoutUrl, "_blank");
      }
    } catch (err) {
      addToastError(err);
    }
  }, [dispatch, topUpAmount]);

  // State 2: paid but not authenticated — sign-up prompt
  if (mode === "paid" && !jwt) {
    return (
      <div className={s.root}>
        <div className={s.signUpCard}>
          <h3 className={s.signUpTitle}>Sign up to continue</h3>
          <p className={s.signUpHint}>Sign in or create your account to continue</p>
          <button type="button" className={s.googleBtn} onClick={handleContinueWithGoogle}>
            <img src={googleIcon} alt="" width={20} height={20} />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // State 1: paid + authenticated — balance dashboard
  if (mode === "paid" && jwt) {
    const remaining = balance?.remaining ?? 0;
    const usage = balance?.usage ?? 0;
    const limit = balance?.limit ?? 0;

    return (
      <div className={s.root}>
        {/* Balance card */}
        <div className={s.balanceCard}>
          <div className={s.balanceHeader}>
            <h3 className={s.balanceTitle}>Balance</h3>
            <button
              type="button"
              className={s.manageLink}
              onClick={handleManageSubscription}
              disabled={portalBusy}
            >
              Manage
            </button>
          </div>

          <div className={s.balanceHero}>
            <span className={s.balanceAmount}>{formatDollars(remaining)}</span>
            <span className={s.balanceLabel}>Remaining credits</span>
            <span className={s.infoIcon} title="Credits remaining on your plan">
              &#9432;
            </span>
          </div>

          <div className={s.statsRow}>
            <div className={s.statBox}>
              <span className={s.statLabel}>Used today</span>
              <span className={s.statValue}>{formatDollars(0)}</span>
            </div>
            <div className={s.statBox}>
              <span className={s.statLabel}>Used this month</span>
              <span className={s.statValue}>{formatDollars(usage)}</span>
            </div>
            <div className={s.statBox}>
              <span className={s.statLabel}>Per month plan</span>
              <span className={s.statValue}>{formatDollars(limit)}</span>
            </div>
          </div>
        </div>

        {/* Auto-refill */}
        <div className={s.refillCard}>
          <div className={s.refillRow}>
            <div className={s.refillInfo}>
              <span className={s.refillLabel}>
                Auto refill credits
                <span className={s.infoIcon} title="Automatically add credits when balance is low">
                  &#9432;
                </span>
              </span>
            </div>
            <label className={s.toggle}>
              <input
                type="checkbox"
                checked={autoRefill}
                onChange={(e) => setAutoRefill(e.target.checked)}
              />
              <span className={s.toggleTrack} />
            </label>
          </div>
          <span className={s.refillHint}>
            Add {formatDollars(10)} when balance &lt; {formatDollars(2)}
          </span>
        </div>

        {/* One-Time Top-Up */}
        <div className={s.topUpSection}>
          <h3 className={s.topUpTitle}>One-Time Top-Up</h3>
          <div className={s.topUpRow}>
            <div className={s.topUpInputWrap}>
              <span className={s.topUpCurrency}>$</span>
              <input
                type="number"
                className={s.topUpInput}
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                min={0.01}
                step={0.01}
              />
            </div>
            <SecondaryButton onClick={() => void handleTopUp()} disabled={topUpPending}>
              {topUpPending ? "Opening..." : "Top Up"}
            </SecondaryButton>
          </div>
        </div>

        {/* Account footer */}
        <div className={s.accountFooter}>
          <div className={s.accountAvatar}>{email ? email.charAt(0).toUpperCase() : "?"}</div>
          <span className={s.accountEmail}>{email}</span>
          <button
            type="button"
            className={s.logoutBtn}
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        <Modal
          open={confirmLogoutOpen}
          onClose={() => {
            if (logoutBusy) return;
            setConfirmLogoutOpen(false);
          }}
          header="Log out?"
          aria-label="Confirm log out"
        >
          <p className={s.logoutConfirmDescription}>
            You will stay in subscription mode, but your current account session will be signed out.
          </p>
          <div className={s.logoutConfirmActions}>
            <button
              type="button"
              className={s.logoutConfirmCancel}
              onClick={() => setConfirmLogoutOpen(false)}
              disabled={logoutBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={s.logoutConfirmAccept}
              onClick={() => void handleConfirmLogout()}
              disabled={logoutBusy}
            >
              {logoutBusy ? "Logging out..." : "Log out"}
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  // State 3: self-managed fallback (tab should be hidden)
  return (
    <div className={s.root}>
      <div className={s.balanceCard}>
        <h3 className={s.balanceTitle}>Account</h3>
        <p className={s.selfManagedHint}>
          You are in self-managed mode. Switch to subscription in the Other tab to use managed AI
          models.
        </p>
      </div>
    </div>
  );
}
