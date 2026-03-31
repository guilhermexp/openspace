let currentUserId: string | null = null;

export function initPosthogMain(userId: string, _enabled: boolean): void {
  currentUserId = userId;
}

export function captureMain(_event: string, _properties?: Record<string, unknown>): void {}

export function optInMain(userId: string): void {
  currentUserId = userId;
}

export function optOutMain(): void {
  currentUserId = null;
}

export async function shutdownPosthogMain(): Promise<void> {
  currentUserId = null;
}
