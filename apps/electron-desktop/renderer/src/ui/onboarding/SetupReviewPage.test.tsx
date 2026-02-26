// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SetupReviewPage } from "./SetupReviewPage";

const mockOnAutoTopUpPatch = vi.fn().mockResolvedValue(undefined);

vi.mock("@shared/billing/AutoTopUpControl", () => ({
  AutoTopUpControl: ({
    onPatch,
  }: {
    onPatch: (payload: { enabled?: boolean }) => Promise<unknown>;
  }) => (
    <button type="button" onClick={() => void onPatch({ enabled: false })}>
      Open Auto Top-Up
    </button>
  ),
}));

describe("SetupReviewPage", () => {
  it("renders auto top-up controls and forwards patch handler", async () => {
    render(
      <SetupReviewPage
        totalSteps={6}
        activeStep={5}
        selectedModel="GPT-5"
        subscriptionPrice={null}
        onPay={() => {}}
        onBack={() => {}}
        autoTopUp={{
          enabled: true,
          thresholdUsd: 2,
          topupAmountUsd: 10,
          monthlyCapUsd: 300,
          hasPaymentMethod: true,
          currentMonthSpentUsd: 0,
        }}
        autoTopUpLoading={false}
        autoTopUpSaving={false}
        autoTopUpError={null}
        onAutoTopUpPatch={mockOnAutoTopUpPatch}
      />
    );

    fireEvent.click(screen.getByText("Open Auto Top-Up"));

    await waitFor(() => {
      expect(mockOnAutoTopUpPatch).toHaveBeenCalledWith({ enabled: false });
    });
  });
});
