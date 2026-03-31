import { execFileSync } from "node:child_process";

import type { Platform } from "../platform";
import { waitForPortOpen } from "../util/net";

const GLOBAL_GATEWAY_LAUNCH_AGENT_LABEL = "ai.openclaw.gateway";

type ReclaimParams = {
  preferredPort: number;
  isPackaged: boolean;
  platformName: Platform["name"];
};

type ReclaimDeps = {
  probePort?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  execFileSync?: typeof execFileSync;
  getUid?: () => number | undefined;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  warn?: (message: string) => void;
};

export async function reclaimDefaultPortFromGlobalGatewayForDev(
  params: ReclaimParams,
  deps: ReclaimDeps = {},
): Promise<boolean> {
  if (params.isPackaged || params.platformName !== "darwin") {
    return false;
  }

  const getUid = deps.getUid ?? (() => (typeof process.getuid === "function" ? process.getuid() : undefined));
  const uid = getUid();
  if (uid == null) {
    return false;
  }

  const probePort = deps.probePort ?? waitForPortOpen;
  const portIsBusy = await probePort("127.0.0.1", params.preferredPort, 150);
  if (!portIsBusy) {
    return false;
  }

  const launchctl = deps.execFileSync ?? execFileSync;
  const target = `gui/${uid}/${GLOBAL_GATEWAY_LAUNCH_AGENT_LABEL}`;
  try {
    launchctl("launchctl", ["print", target], { stdio: "ignore" });
  } catch {
    return false;
  }

  deps.log?.(
    `[bootstrap] preferred port ${params.preferredPort} is occupied; unloading global ${GLOBAL_GATEWAY_LAUNCH_AGENT_LABEL}`,
  );

  try {
    launchctl("launchctl", ["bootout", target], { stdio: "ignore" });
  } catch (error) {
    deps.warn?.(
      `[bootstrap] failed to unload global ${GLOBAL_GATEWAY_LAUNCH_AGENT_LABEL}: ${String(error)}`,
    );
    return false;
  }

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await probePort("127.0.0.1", params.preferredPort, 150))) {
      return true;
    }
    await sleep(100);
  }

  deps.warn?.(
    `[bootstrap] global ${GLOBAL_GATEWAY_LAUNCH_AGENT_LABEL} stopped but port ${params.preferredPort} is still busy`,
  );
  return false;
}
