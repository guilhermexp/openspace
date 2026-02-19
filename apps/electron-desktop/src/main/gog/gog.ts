import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { GogExecResult } from "./types";

export function runGog(params: {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<GogExecResult> {
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 120_000;
  return new Promise<GogExecResult>((resolve) => {
    const child = spawn(params.bin, params.args, {
      cwd: params.cwd,
      env: params.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onData = (buf: Buffer, which: "stdout" | "stderr") => {
      const text = buf.toString("utf-8");
      if (which === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };
    child.stdout?.on("data", (b: Buffer) => onData(b, "stdout"));
    child.stderr?.on("data", (b: Buffer) => onData(b, "stderr"));

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0,
        code: typeof code === "number" ? code : null,
        stdout,
        stderr,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${String(err)}`,
      });
    });
  });
}

export function parseGogAuthListEmails(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText || "{}") as { accounts?: unknown };
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const emails = accounts
      .map((a) => (a && typeof a === "object" ? (a as { email?: unknown }).email : undefined))
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return Array.from(new Set(emails));
  } catch {
    return [];
  }
}

export async function clearGogAuthTokens(params: {
  gogBin: string;
  openclawDir: string;
  warnings: string[];
}) {
  if (!fs.existsSync(params.gogBin)) {
    params.warnings.push(`gog binary not found at: ${params.gogBin}`);
    return;
  }
  const list = await runGog({
    bin: params.gogBin,
    args: ["auth", "list", "--json", "--no-input"],
    cwd: params.openclawDir,
    timeoutMs: 15_000,
  });
  if (!list.ok) {
    const msg = (list.stderr || list.stdout || "").trim();
    params.warnings.push(`gog auth list failed: ${msg || "unknown error"}`);
    return;
  }
  const emails = parseGogAuthListEmails(list.stdout);
  for (const email of emails) {
    const res = await runGog({
      bin: params.gogBin,
      args: ["auth", "remove", email, "--force", "--no-input"],
      cwd: params.openclawDir,
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      const msg = (res.stderr || res.stdout || "").trim();
      params.warnings.push(`gog auth remove failed for ${email}: ${msg || "unknown error"}`);
    }
  }
}

const GOG_CREDENTIALS_HASH_FILE = "gog-credentials-hash";

function fileHash(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readStoredCredentialsHash(stateDir: string): string {
  try {
    return fs.readFileSync(path.join(stateDir, GOG_CREDENTIALS_HASH_FILE), "utf-8").trim();
  } catch {
    return "";
  }
}

function writeStoredCredentialsHash(stateDir: string, hash: string): void {
  fs.writeFileSync(path.join(stateDir, GOG_CREDENTIALS_HASH_FILE), hash, "utf-8");
}

export async function ensureGogCredentialsConfigured(params: {
  gogBin: string;
  openclawDir: string;
  credentialsJsonPath: string;
  stateDir: string;
}): Promise<void> {
  if (!fs.existsSync(params.gogBin)) {
    return;
  }
  if (!fs.existsSync(params.credentialsJsonPath)) {
    return;
  }

  const bundledHash = fileHash(params.credentialsJsonPath);
  const storedHash = readStoredCredentialsHash(params.stateDir);

  if (bundledHash === storedHash) {
    return;
  }

  const res = await runGog({
    bin: params.gogBin,
    args: ["auth", "credentials", "set", params.credentialsJsonPath, "--no-input"],
    cwd: params.openclawDir,
    timeoutMs: 30_000,
  });
  if (res.ok) {
    writeStoredCredentialsHash(params.stateDir, bundledHash);
  } else {
    const stderr = res.stderr.trim();
    const stdout = res.stdout.trim();
    console.warn(
      `[electron-desktop] gog auth credentials set failed: ${stderr || stdout || "unknown error"} (bin: ${params.gogBin})`
    );
  }
}
