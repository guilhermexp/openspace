let currentUserId: string | null = null;

export function initPosthogRenderer(userId: string, _enabled: boolean): void {
  currentUserId = userId;
}

export function captureRenderer(_event: string, _properties?: Record<string, unknown>): void {}

export function optInRenderer(userId: string): void {
  currentUserId = userId;
}

export function optOutRenderer(): void {
  currentUserId = null;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}
