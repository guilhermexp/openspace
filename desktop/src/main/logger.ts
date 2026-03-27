import log from "electron-log/main";
import { app } from "electron";
import * as path from "node:path";

/**
 * Initializes electron-log: writes main-process logs to `{userData}/logs/main.log`
 * and patches global `console` so existing console.log/warn/error calls are captured.
 * Must be called after any `app.setPath("userData", ...)` overrides.
 */
export function initLogger(): void {
  const logsDir = path.join(app.getPath("userData"), "logs");

  log.transports.file.resolvePathFn = () => path.join(logsDir, "main.log");
  log.transports.file.maxSize = 5 * 1024 * 1024;

  log.initialize();
}

export default log;
