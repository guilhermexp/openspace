export const SELF_FLOW = {
  totalSteps: 5,
  steps: { provider: 0, apiKey: 1, model: 2, skills: 3, connections: 4 },
} as const;

export const PAID_FLOW = {
  totalSteps: 6,
  steps: { auth: 0, model: 1, skills: 2, connections: 3, review: 4, success: 5 },
} as const;

export const RESTORE_FLOW = {
  totalSteps: 2,
  steps: { option: 0, file: 1 },
} as const;
