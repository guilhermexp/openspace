export function initPosthogMain(_userId: string, _enabled: boolean): void {}

export function captureMain(_event: string, _properties?: Record<string, unknown>): void {}

export function optInMain(_userId: string): void {}

export function optOutMain(): void {}

export async function shutdownPosthogMain(): Promise<void> {}
