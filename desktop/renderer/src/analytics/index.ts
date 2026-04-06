export { ANALYTICS_EVENTS } from "./analytics-events";
export type { AnalyticsEvent } from "./analytics-events";

// Analytics stubs — PostHog was removed
export function captureRenderer(_event: string, _props?: Record<string, unknown>): void {}
export function optInRenderer(): void {}
export function optOutRenderer(): void {}
export function getCurrentUserId(): string | undefined {
  return undefined;
}
