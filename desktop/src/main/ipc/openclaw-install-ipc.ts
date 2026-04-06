import { ipcMain } from "electron";

import type {
  OpenClawInstallResult,
  OpenClawInstallStatus,
} from "../../shared/desktop-bridge-contract";
import { IPC } from "../../shared/ipc-channels";
import { resolveGlobalOpenClaw } from "../openclaw/paths";
import type { OpenclawInstallHandlerParams } from "./types";
import { runCommand } from "./exec";

const INSTALL_TIMEOUT_MS = 10 * 60_000;
const ONBOARD_TIMEOUT_MS = 5 * 60_000;

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function checkOpenClawInstalled(): OpenClawInstallStatus {
  const runtime = resolveGlobalOpenClaw();
  return {
    installed: Boolean(runtime),
    bin: runtime?.bin ?? null,
    dir: runtime?.dir ?? null,
  };
}

export async function installOpenClaw(): Promise<OpenClawInstallResult> {
  const installCommand = "npm install -g openclaw@latest";
  const daemonCommand = "openclaw onboard --install-daemon";
  const installRes = await runCommand({
    bin: npmCommand(),
    args: ["install", "-g", "openclaw@latest"],
    timeoutMs: INSTALL_TIMEOUT_MS,
  });

  if (!installRes.ok) {
    return {
      ...checkOpenClawInstalled(),
      ok: false,
      stdout: installRes.stdout,
      stderr: installRes.stderr,
      needsManualInstall: true,
      installCommand,
      daemonCommand,
    };
  }

  const runtime = resolveGlobalOpenClaw();
  if (!runtime) {
    return {
      installed: false,
      bin: null,
      dir: null,
      ok: false,
      stdout: installRes.stdout,
      stderr: `${installRes.stderr}${installRes.stderr ? "\n" : ""}OpenClaw binary not found after npm install.`,
      needsManualInstall: true,
      installCommand,
      daemonCommand,
    };
  }

  const onboardRes = await runCommand({
    bin: runtime.bin,
    args: ["onboard", "--install-daemon"],
    cwd: runtime.dir,
    timeoutMs: ONBOARD_TIMEOUT_MS,
  });
  const finalRuntime = resolveGlobalOpenClaw();

  return {
    installed: Boolean(finalRuntime),
    bin: finalRuntime?.bin ?? runtime.bin,
    dir: finalRuntime?.dir ?? runtime.dir,
    ok: onboardRes.ok,
    stdout: [installRes.stdout, onboardRes.stdout].filter(Boolean).join("\n"),
    stderr: [installRes.stderr, onboardRes.stderr].filter(Boolean).join("\n"),
    needsManualInstall: !onboardRes.ok,
    installCommand,
    daemonCommand,
  };
}

export function registerOpenclawInstallHandlers(_params: OpenclawInstallHandlerParams) {
  ipcMain.handle(IPC.openclawCheckInstalled, async () => checkOpenClawInstalled());
  ipcMain.handle(IPC.openclawInstall, async () => installOpenClaw());
}
