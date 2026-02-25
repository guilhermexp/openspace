/**
 * Account / Billing tab for Settings.
 * Shows balance dashboard, auto-refill toggle, top-up form,
 * and account info with logout (paid mode),
 * or a prompt to switch to managed mode (self-managed).
 */
import React from "react";

import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { fetchDesktopStatus, fetchBalance, clearAuth, authActions } from "@store/slices/authSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi } from "@ipc/backendApi";
import { persistDesktopMode } from "../../shared/persistMode";
import { PrimaryButton, SecondaryButton } from "@shared/kit";
import { addToastError, addToast } from "@shared/toast";

import s from "./AccountTab.module.css";

function formatDollars(n: number): string {
  return `$${n.toFixed(0)}`;
}

export function AccountTab() {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const { mode, jwt, email, balance, subscription, loading } = useAppSelector((st) => st.auth);
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [autoRefill, setAutoRefill] = React.useState(true);
  const [topUpAmount, setTopUpAmount] = React.useState("100");

  React.useEffect(() => {
    if (jwt && mode === "paid") {
      void dispatch(fetchDesktopStatus());
    }
  }, [dispatch, jwt, mode]);

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

  const handleLogout = React.useCallback(async () => {
    dispatch(authActions.setMode("self-managed"));
    void persistDesktopMode(gw.request, "self-managed");
    await dispatch(clearAuth());
    addToast("Logged out. You can sign in again anytime.");
  }, [dispatch, gw.request]);

  const handleSwitchToPaid = React.useCallback(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
    const url = `${backendUrl}/auth/google/desktop`;
    const api = getDesktopApiOrNull();
    if (api?.openExternal) {
      void api.openExternal(url);
    }
  }, []);

  const handleTopUp = React.useCallback(() => {
    const amount = Number.parseInt(topUpAmount, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      addToast("Enter a valid amount");
      return;
    }
    addToast("Top-up is not available yet");
  }, [topUpAmount]);

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
          <span className={s.refillHint}>Add $10 when balance &lt; $2</span>
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
                min={1}
              />
            </div>
            <SecondaryButton onClick={handleTopUp}>Top Up</SecondaryButton>
          </div>
        </div>

        {/* Account footer */}
        <div className={s.accountFooter}>
          <div className={s.accountAvatar}>{email ? email.charAt(0).toUpperCase() : "?"}</div>
          <span className={s.accountEmail}>{email}</span>
          <button
            type="button"
            className={s.logoutBtn}
            onClick={handleLogout}
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
      </div>
    );
  }

  return (
    <div className={s.root}>
      <div className={s.balanceCard}>
        <h3 className={s.balanceTitle}>Account</h3>
        <p className={s.selfManagedHint}>
          You are using your own API keys. Switch to managed mode to let us handle API keys and
          billing for you.
        </p>
        <PrimaryButton size="sm" onClick={handleSwitchToPaid}>
          Switch to managed mode
        </PrimaryButton>
      </div>
    </div>
  );
}
