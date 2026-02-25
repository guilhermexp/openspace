/**
 * IPC handlers for backend authentication (Google OAuth JWT flow)
 * and secure token storage for the paid "Do everything for me" mode.
 */
import { ipcMain, safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

import type { RegisterParams } from "./types";

export type AuthTokenData = {
  jwt: string;
  email: string;
  userId: string;
  isNewUser: boolean;
  storedAt: string;
};

function authFilePath(stateDir: string): string {
  return path.join(stateDir, "auth-token.enc");
}

function storeAuthToken(stateDir: string, data: AuthTokenData): void {
  const filePath = authFilePath(stateDir);
  const json = JSON.stringify(data);

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(filePath, encrypted);
  } else {
    fs.writeFileSync(filePath, json, "utf-8");
  }
}

function readAuthToken(stateDir: string): AuthTokenData | null {
  const filePath = authFilePath(stateDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath);
    let json: string;

    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(raw);
    } else {
      json = raw.toString("utf-8");
    }

    return JSON.parse(json) as AuthTokenData;
  } catch {
    return null;
  }
}

function clearAuthToken(stateDir: string): void {
  const filePath = authFilePath(stateDir);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function registerAuthHandlers(params: RegisterParams) {
  ipcMain.handle(
    "auth:store-token",
    async (_evt, p: { jwt?: unknown; email?: unknown; userId?: unknown; isNewUser?: unknown }) => {
      const jwt = typeof p?.jwt === "string" ? p.jwt : "";
      const email = typeof p?.email === "string" ? p.email : "";
      const userId = typeof p?.userId === "string" ? p.userId : "";
      const isNewUser = p?.isNewUser === true;

      if (!jwt || !email || !userId) {
        throw new Error("jwt, email, and userId are required");
      }

      storeAuthToken(params.stateDir, {
        jwt,
        email,
        userId,
        isNewUser,
        storedAt: new Date().toISOString(),
      });

      return { ok: true } as const;
    }
  );

  ipcMain.handle("auth:get-token", async () => {
    const data = readAuthToken(params.stateDir);
    return { data } as const;
  });

  ipcMain.handle("auth:clear-token", async () => {
    clearAuthToken(params.stateDir);
    return { ok: true } as const;
  });
}
