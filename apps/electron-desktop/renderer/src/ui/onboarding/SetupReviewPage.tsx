import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import type { SubscriptionPriceInfo } from "@ipc/backendApi";

import s from "./SetupReviewPage.module.css";

function formatPrice(price: SubscriptionPriceInfo | null): string {
  if (!price || !price.amountCents) return "$15/mo";
  const dollars = price.amountCents / 100;
  const interval = price.interval === "year" ? "yr" : "mo";
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}/${interval}`;
}

export function SetupReviewPage(props: {
  selectedModel: string;
  subscriptionPrice: SubscriptionPriceInfo | null;
  onPay: () => void;
  onBack: () => void;
  busy?: boolean;
  paymentPending?: boolean;
}) {
  const totalSteps = 4;
  const activeStep = 3;
  const priceLabel = formatPrice(props.subscriptionPrice);

  if (props.paymentPending) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Waiting for payment">
        <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
          <div className={s.UiSetupReviewPending}>
            <span className="UiButtonSpinner" aria-hidden="true" />
            <div className={s.UiSetupReviewPendingTitle}>Waiting for payment...</div>
            <div className={s.UiSetupReviewPendingHint}>
              Complete the checkout in your browser, then return here.
            </div>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup review">
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
        <div className="UiOnboardingDots" aria-label="Onboarding progress">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <span
              key={idx}
              className={`UiOnboardingDot ${idx === activeStep ? "UiOnboardingDot--active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="UiSectionTitle">Your OpenClaw Setup</div>
        <div className="UiSectionSubtitle">Review your subscription before proceeding.</div>

        <div className={s.UiSetupReviewGrid}>
          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>
              AI Model{" "}
              <span className={s.UiSetupReviewInfoIcon} title="Selected model">
                ⓘ
              </span>
            </div>
            <div className={s.UiSetupReviewTileValue}>{props.selectedModel}</div>
          </div>

          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>
              Subscription{" "}
              <span
                className={s.UiSetupReviewInfoIcon}
                title="Monthly subscription includes AI credits and a cloud VPS"
              >
                ⓘ
              </span>
            </div>
            <div className={s.UiSetupReviewTileValue}>{priceLabel}</div>
            <div className={s.UiSetupReviewRefillDesc}>
              {props.subscriptionPrice?.credits
                ? `$${props.subscriptionPrice.credits} AI credits + Cloud VPS`
                : "AI credits + Cloud VPS included"}
            </div>
          </div>

          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>Included integrations</div>
            <div className={s.UiSetupReviewIntegrations}>
              <span className={s.UiSetupReviewIntIcon} title="Notion">
                📝
              </span>
              <span className={s.UiSetupReviewIntIcon} title="Figma">
                🎨
              </span>
              <span className={s.UiSetupReviewIntIcon} title="WhatsApp">
                💬
              </span>
              <span className={s.UiSetupReviewIntIcon} title="Slack">
                📢
              </span>
              <span className={s.UiSetupReviewIntIcon} title="Google">
                🔍
              </span>
              <span className={s.UiSetupReviewIntCount}>200+</span>
            </div>
          </div>

          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>Included Features</div>
            <ul className={s.UiSetupReviewFeatureList}>
              <li>🖥 Dedicated cloud server (VPS)</li>
              <li>🎙 Voice chat</li>
              <li>🌐 Web search &amp; Browser actions</li>
              <li>📎 Works with files and images</li>
            </ul>
          </div>
        </div>

        <div className="UiProviderContinueRow">
          <div>
            <button className="UiTextButton" type="button" onClick={props.onBack}>
              Back
            </button>
          </div>
          <div>
            <PrimaryButton
              size="sm"
              disabled={props.busy}
              loading={props.busy}
              onClick={props.onPay}
            >
              Subscribe {priceLabel}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
