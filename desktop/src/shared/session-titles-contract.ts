export type SessionTitleSeed = {
  sessionKey: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
};

export type SessionTitleRecord = {
  title: string;
  sourceHash: string;
  updatedAt: string;
};

export type SessionTitleMap = Record<string, SessionTitleRecord>;
