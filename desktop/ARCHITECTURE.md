# OpenSpace Desktop Architecture

Reference for the Electron desktop shell around OpenClaw.

Audit scope: every file under `desktop/src/`, every file under `desktop/src/shared/`, `desktop/package.json`, `.github/workflows/build-desktop.yml`, `.github/workflows/sync-openclaw.yml`, and the Electron Builder hook scripts used by packaging were read before writing this document. Audited against commit `6b3ffb7940`.

## 1. High-Level Overview

### Process split

- **Main process**: `desktop/src/main.ts` owns lifecycle, mutable app state, tray, BrowserWindow creation, OpenClaw gateway spawning, IPC registration, deep links, reset, updater, backup/restore, and native integrations.
- **Preload process**: `desktop/src/preload.ts` exposes `window.openclawDesktop` through `contextBridge.exposeInMainWorld()`. The API surface is typed by `OpenclawDesktopApi` in `desktop/src/shared/desktop-bridge-contract.ts`.
- **Renderer**: loaded from `renderer/dist/index.html` by `createMainWindow()` in `desktop/src/main/window/mainWindow.ts`. Renderer code is not trusted with native APIs; it must go through preload IPC.
- **Gateway child process**: started by `createGatewayStarter()` in `desktop/src/main/gateway/lifecycle.ts`, which calls `spawnGateway()` in `desktop/src/main/gateway/spawn.ts` to run `openclaw.mjs gateway`.
- **Auxiliary child processes**: `gog`, `memo`, `remindctl`, `obsidian-cli`, `gh`, `whisper-cli`, `ffmpeg`, terminal PTYs, platform tools (`launchctl`, `powershell`, `tar`, `unzip`, `osascript`, etc.).

### Boot sequence

1. `desktop/src/main.ts` calls `getPlatform()` immediately. On Windows this runs `Win32Platform.init()` and monkey-patches `child_process` to force `windowsHide: true`.
2. If `OPENSPACE_E2E_USER_DATA` is set, `app.setPath("userData", ...)` is applied before logging.
3. `initLogger()` points `electron-log` at `{userData}/logs/main.log`.
4. `registerProtocolHandler("openspace")` registers the deep-link protocol.
5. `createAppState()` creates the single mutable `AppState` object.
6. `registerAppLifecycle()` wires `open-url`, `second-instance`, `window-all-closed`, `activate`, `process.exit`, and `before-quit`.
7. `app.whenReady()` calls `bootstrapApp()`.
8. `bootstrapApp()` resolves `stateDir`, `logsDir`, `whisperDataDir`, bundled/dev binary paths, renderer/preload paths, consent state, and gateway config/token.
9. `bootstrapApp()` runs `killOrphanedGateway()`, `removeStaleGatewayLock()`, `runConfigMigrations()`, and `runExecApprovalsMigrations()` before opening the UI.
10. `bootstrapApp()` builds `startGateway` via `createGatewayStarter()`.
11. `registerIpcHandlers()` and `registerTerminalIpcHandlers()` are called before `ensureMainWindow()`.
12. `ensureMainWindow()` creates the BrowserWindow and loads `renderer/dist/index.html`.
13. `createTray()` initializes the tray once.
14. `killUpdateSplash()` clears any stale macOS update splash; packaged builds then call `initAutoUpdater()`.
15. `cleanupAudioCache()` runs best-effort in the background.
16. `startGateway()` broadcasts `gateway-state` as `starting`, then `ready` or `failed`.

## 2. Module Map

### 2.1 Core Runtime

- **Purpose**: entrypoint, shared mutable state, consent persistence, deep-link parsing, logging, tray, update splash, audio cache, network helpers.
- **Key files**: `desktop/src/main.ts`, `desktop/src/main/app-state.ts`, `desktop/src/main/consent.ts`, `desktop/src/main/deep-link.ts`, `desktop/src/main/logger.ts`, `desktop/src/main/tray.ts`, `desktop/src/main/audio-cache.ts`, `desktop/src/main/update-splash.ts`, `desktop/src/main/constants.ts`, `desktop/src/main/types.ts`, `desktop/src/main/util/fs.ts`, `desktop/src/main/util/net.ts`.
- **Key exports**:
  `createAppState()`, `readConsentAccepted()`, `writeConsentAccepted()`, `parseDeepLinkUrl()`, `handleDeepLink()`, `initLogger()`, `createTray()`, `persistAudioFile()`, `getCachedAudioPath()`, `cleanupAudioCache()`, `showUpdateSplash()`, `killUpdateSplash()`, `createTailBuffer()`, `waitForPortOpen()`, `pickPort()`.
- **Dependencies**: `bootstrap`, `gateway/lifecycle`, `platform`, `window/window-manager`, `updater`.
- **Events / IPC**: emits `deep-link` and replays `gateway-state`; no handler registration lives here.

### 2.2 bootstrap

- **Purpose**: app startup orchestration and lifecycle guardrails.
- **Key files**: `desktop/src/main/bootstrap/app-bootstrap.ts`, `desktop/src/main/bootstrap/app-lifecycle.ts`, `desktop/src/main/bootstrap/dev-global-gateway.ts`.
- **Key exports**:
  `bootstrapApp()`, `registerProtocolHandler()`, `registerAppLifecycle()`, `reclaimDefaultPortFromGlobalGatewayForDev()`.
- **Dependencies**: `consent`, `gateway/config`, `gateway/config-migrations`, `gateway/exec-approvals-migrations`, `gateway/lifecycle`, `gateway/pid-file`, `ipc/register`, `terminal/ipc`, `openclaw/paths`, `updater`, `audio-cache`, `window`.
- **Important behavior**:
  `bootstrapApp()` registers IPC before opening the window.
  `reclaimDefaultPortFromGlobalGatewayForDev()` unloads LaunchAgent `ai.openclaw.gateway` on macOS dev when port `1515` is occupied.
- **Events / IPC**: none directly.

### 2.3 gateway

- **Purpose**: OpenClaw config creation/migration, process spawning, process state broadcasting, PID/lock cleanup, desktop-only model injection.
- **Key files**: `desktop/src/main/gateway/config.ts`, `desktop/src/main/gateway/config-migrations.ts`, `desktop/src/main/gateway/exec-approvals-migrations.ts`, `desktop/src/main/gateway/lifecycle.ts`, `desktop/src/main/gateway/pid-file.ts`, `desktop/src/main/gateway/spawn.ts`, `desktop/src/main/gateway/extra-models.ts`.
- **Key exports**:
  `readGatewayTokenFromConfig()`, `ensureGatewayConfigFile()`, `runConfigMigrations()`, `runExecApprovalsMigrations()`, `createGatewayStarter()`, `broadcastGatewayState()`, `stopGatewayChild()`, `writeGatewayPid()`, `removeGatewayPid()`, `killOrphanedGateway()`, `removeStaleGatewayLock()`, `spawnGateway()`, `getExtraModels()`.
- **Dependencies**: `platform`, `util/net`, `gog/gog-keyring`, `keys/openai-api-key`, `whisper/model-state`, `whisper/models`, `whisper/ffmpeg`.
- **State files**:
  `{stateDir}/openclaw.json`
  `{stateDir}/desktop-state.json`
  `{stateDir}/gateway.pid`
  `~/.openclaw/exec-approvals.json`
- **Config migrations**:
  v1: enforce `allowedOrigins: ["null"]` and `dangerouslyDisableDeviceAuth: true` for local Electron.
  v2: set `browser.defaultProfile = "openclaw"`.
  v3: scaffold `tools.exec.safeBinProfiles`.
  v4: default `tools.exec.host/security/ask`.
  v5: move legacy top-level `tts` into `messages.tts`.
  v6: normalize legacy Telegram/Discord/Slack streaming config.
- **IPC / events**:
  handler `extra-models`
  event `gateway-state`

### 2.4 terminal

- **Purpose**: embedded multi-session PTY terminal.
- **Key files**: `desktop/src/main/terminal/ipc.ts`, `desktop/src/main/terminal/pty-manager.ts`.
- **Key exports**:
  `registerTerminalIpcHandlers()`, `createTerminal()`, `writeTerminal()`, `resizeTerminal()`, `killTerminal()`, `listTerminals()`, `getTerminalBuffer()`, `killAllTerminals()`.
- **Dependencies**: `node-pty`, `platform`, `BinaryPaths`, main window.
- **Important behavior**:
  terminal sessions start in `stateDir`
  `ensureTerminalBinDir()` creates `stateDir/.terminal-bin/openclaw` or `openclaw.cmd`
  `buildTerminalPath()` prepends bundled tool directories to `PATH`
  session output is buffered in memory up to `100 KB`
- **IPC / events**:
  `terminal:create`
  `terminal:write`
  `terminal:resize`
  `terminal:kill`
  `terminal:list`
  `terminal:get-buffer`
  events `terminal:data`, `terminal:exit`

### 2.5 auth

- **Purpose**: compatibility layer for older auth code; JWT session auth no longer lives in the main process.
- **Key files**: `desktop/src/main/auth/anthropic.ts`, `desktop/src/main/ipc/auth-ipc.ts`.
- **Key exports**:
  `writeAuthProfilesAnthropicApiKey()`, `registerAuthHandlers()`.
- **Dependencies**: `keys/apiKeys`.
- **Important behavior**:
  `registerAuthHandlers()` is intentionally a no-op.
  Renderer JWT state is expected in renderer storage, not Electron main.
- **IPC / events**: none.

### 2.6 keys

- **Purpose**: provider credential persistence and validation.
- **Key files**: `desktop/src/main/keys/apiKeys.ts`, `desktop/src/main/keys/authProfilesStore.ts`, `desktop/src/main/keys/openai-api-key.ts`, `desktop/src/main/keys/validateApiKey.ts`, `desktop/src/main/ipc/keys-ipc.ts`.
- **Key exports**:
  `upsertApiKeyProfile()`, `applyUpsertApiKeyProfile()`, `upsertTokenProfile()`, `upsertOAuthProfile()`, `resolveAuthProfilesPath()`, `readAuthProfilesStore()`, `writeAuthProfilesStoreAtomic()`, `resolveOpenAiApiKeyFromStateDir()`, `validateProviderApiKey()`.
- **Dependencies**: `platform`, `util/fs`, `constants`.
- **Storage path**:
  `{stateDir}/agents/<agentId>/agent/auth-profiles.json`
- **Stored types**:
  `ApiKeyProfile`
  `TokenProfile`
  `OAuthProfile`
  `AuthProfilesStore`
- **IPC / events**:
  `auth-set-api-key`
  `auth-set-setup-token`
  `auth-validate-api-key`
  `auth-has-api-key`
  `auth-read-profiles`
  `auth-write-profiles`

### 2.7 ipc

- **Purpose**: central registration of all non-terminal main-process handlers plus common exec/file helpers.
- **Key files**: `desktop/src/main/ipc/register.ts`, `desktop/src/main/ipc/types.ts`, `desktop/src/main/ipc/exec.ts`, `desktop/src/main/ipc/file-reader.ts`, `desktop/src/main/ipc/files.ts`, `desktop/src/main/ipc/config-ipc.ts`, `desktop/src/main/ipc/oauth-ipc.ts`, `desktop/src/main/ipc/updater-ipc.ts`, `desktop/src/main/ipc/defender-ipc.ts`, `desktop/src/main/ipc/memo-ipc.ts`, `desktop/src/main/ipc/remindctl-ipc.ts`, `desktop/src/main/ipc/obsidian-ipc.ts`, `desktop/src/main/ipc/gh-ipc.ts`, `desktop/src/main/ipc/skills-ipc.ts`, `desktop/src/main/ipc/session-titles-ipc.ts`, `desktop/src/main/ipc/backup/*`.
- **Key exports**:
  `registerIpcHandlers()`, `createBinaryNotFoundResult()`, `checkBinaryExists()`, `runSyncCheck()`, `runCommand()`, `registerFileReaderHandlers()`, `registerFileHandlers()`, plus one `register*Handlers()` per integration.
- **Dependencies**: almost every desktop module. `registerIpcHandlers()` is the composition point.
- **Contract enforcement**:
  `desktop/src/main/ipc/contracts.test.ts` verifies channel coverage.
  `desktop/src/preload.test.ts` verifies `DESKTOP_BRIDGE_KEYS` coverage.
  terminal channels are intentionally excluded from `registerIpcHandlers()` and registered separately.
- **Representative IPC handlers**:
  `open-logs`
  `open-workspace-folder`
  `open-openclaw-folder`
  `devtools-toggle`
  `open-external`
  `list-open-targets`
  `open-file-with`
  `read-file-text`
  `read-file-data-url`
  `resolve-file-path`
  `focus-window`
  `gateway-get-info`
  `consent-get`
  `consent-accept`
  `gateway-start`
  `gateway-retry`
  `config-read`
  `config-write`
  `launch-at-login-get`
  `launch-at-login-set`
  `get-app-version`
  `get-openclaw-runtime-info`
  `fetch-release-notes`
  `updater-check`
  `updater-download`
  `updater-install`

### 2.8 gog

- **Purpose**: Google Workspace CLI integration, credential staging, token cleanup, macOS keyring workaround.
- **Key files**: `desktop/src/main/gog/gog.ts`, `desktop/src/main/gog/gog-keyring.ts`, `desktop/src/main/gog/ipc.ts`, `desktop/src/main/gog/types.ts`.
- **Key exports**:
  `runGog()`, `parseGogAuthListEmails()`, `clearGogAuthTokens()`, `ensureGogCredentialsConfigured()`, `ensureGogKeyringSecret()`, `getGogKeyringEnv()`, `registerGogIpcHandlers()`.
- **Dependencies**: `platform`, `ipc/exec`.
- **State files**:
  `{stateDir}/gog-keyring`
  `{stateDir}/gog-credentials-hash`
- **Important behavior**:
  on macOS `getGogKeyringEnv()` forces `GOG_KEYRING_BACKEND=file`
  `gog-auth-add` lazily runs `ensureGogCredentialsConfigured()` to avoid startup Dock bounce
- **IPC / events**:
  `gog-auth-list`
  `gog-auth-add`
  `gog-auth-credentials`

### 2.9 openclaw

- **Purpose**: resolve dev-vs-packaged paths for the OpenClaw bundle, Node runtime, preload, renderer, and optional credentials.
- **Key files**: `desktop/src/main/openclaw/paths.ts`.
- **Key exports**:
  `resolveRepoRoot()`, `resolveBundledOpenClawDir()`, `resolveBundledNodeBin()`, `bundledBin()`, `downloadedBin()`, `resolveBin()`, `resolveBundledGogCredentialsPath()`, `resolveDownloadedGogCredentialsPath()`, `resolveGogCredentialsPaths()`, `resolveRendererIndex()`, `resolvePreloadPath()`.
- **Dependencies**: `platform`.
- **Important behavior**:
  packaged OpenClaw lives under `process.resourcesPath/openclaw`
  packaged Node lives under `process.resourcesPath/node/<platform>-<arch>/...`
  optional runtimes are resolved from bundled resources in production and `.<tool>-runtime/` in dev
- **IPC / events**: none.

### 2.10 platform

- **Purpose**: OS abstraction for process management, shell selection, wrapper creation, binary naming, config paths, permissions, archive extraction, updater splash, and gateway lock naming.
- **Key files**: `desktop/src/main/platform/types.ts`, `desktop/src/main/platform/index.ts`, `desktop/src/main/platform/darwin.ts`, `desktop/src/main/platform/win32.ts`.
- **Key exports**:
  `Platform`, `getPlatform()`, `DarwinPlatform`, `Win32Platform`.
- **Dependencies**: none higher-level; this is foundational.
- **Important behavior**:
  Linux uses `DarwinPlatform`'s Unix-like implementation
  Windows `init()` patches `spawn`, `spawnSync`, `execFile`, `execFileSync`, and `execSync`
  `gatewaySpawnOptions()` differs materially by OS: macOS/Linux use detached gateway with `--force`; Windows does not
- **IPC / events**: none.

### 2.11 window

- **Purpose**: BrowserWindow creation, reuse, and display.
- **Key files**: `desktop/src/main/window/mainWindow.ts`, `desktop/src/main/window/window-manager.ts`.
- **Key exports**:
  `createMainWindow()`, `ensureMainWindow()`, `showMainWindow()`.
- **Dependencies**: `tray/getWindowIconPath`, Electron `session.defaultSession.webRequest`.
- **Important behavior**:
  BrowserWindow uses `sandbox: true` and `contextIsolation: true`
  `createMainWindow()` strips `frame-ancestors` from CSP and removes `X-Frame-Options` so the gateway UI can be embedded from `file://`
  dev-only renderer diagnostics forward console/fail-load/unresponsive events to main-process logs
- **IPC / events**: none directly.

### 2.12 updater

- **Purpose**: auto-update checks/download/install and macOS update splash handoff.
- **Key files**: `desktop/src/main/updater.ts`, `desktop/src/main/update-splash.ts`, `desktop/src/main/ipc/updater-ipc.ts`.
- **Key exports**:
  `initAutoUpdater()`, `checkForUpdates()`, `downloadUpdate()`, `installUpdate()`, `getAppVersion()`, `disposeAutoUpdater()`, `showUpdateSplash()`, `killUpdateSplash()`, `registerUpdaterIpcHandlers()`.
- **Dependencies**: `electron-updater`, `platform`.
- **Important behavior**:
  checks start `5s` after boot and repeat every `5 min`
  `autoDownload = false`
  `autoInstallOnAppQuit = true`
  `installUpdate()` shows the native update splash before `quitAndInstall()`
- **IPC / events**:
  `fetch-release-notes`
  `updater-check`
  `updater-download`
  `updater-install`
  events `updater-available`, `updater-download-progress`, `updater-downloaded`, `updater-error`
  internal main-only event names also sent by `updater.ts`: `updater-checking`, `updater-not-available`

### 2.13 session-titles

- **Purpose**: persistent friendly chat titles generated from session seeds.
- **Key files**: `desktop/src/main/session-titles/service.ts`, `desktop/src/main/ipc/session-titles-ipc.ts`, `desktop/src/shared/session-titles-contract.ts`.
- **Key exports**:
  `resolveSessionTitlesPath()`, `readSessionTitlesStore()`, `writeSessionTitlesStore()`, `ensureFriendlySessionTitles()`, `registerSessionTitlesHandlers()`.
- **Dependencies**: `keys/openai-api-key`, `electron.net.fetch`.
- **Storage file**:
  `{stateDir}/friendly-session-titles.json`
- **Important behavior**:
  uses OpenAI Responses API model `gpt-5.4-nano-2026-03-17`
  hashes `{sessionKey, derivedTitle, lastMessagePreview}` plus prompt version to avoid regenerating unchanged titles
  silently returns cached titles when no OpenAI API key is configured
- **IPC / events**:
  `session-titles-list`
  `session-titles-ensure`

### 2.14 whisper

- **Purpose**: voice transcription, model download, ffmpeg bootstrap, gateway model selection.
- **Key files**: `desktop/src/main/whisper/models.ts`, `desktop/src/main/whisper/model-state.ts`, `desktop/src/main/whisper/download.ts`, `desktop/src/main/whisper/ffmpeg.ts`, `desktop/src/main/whisper/ipc.ts`.
- **Key exports**:
  `WHISPER_MODELS`, `DEFAULT_MODEL_ID`, `getModelDef()`, `resolveModelPath()`, `readSelectedWhisperModel()`, `writeSelectedWhisperModel()`, `downloadFile()`, `resolveFfmpegPath()`, `ensureFfmpeg()`, `registerWhisperIpcHandlers()`.
- **Dependencies**: `platform`, `keys/openai-api-key`, `gateway/spawn`.
- **Storage files**:
  `{whisperDataDir}/models/<model file>`
  `{stateDir}/whisper-model-id`
  `{whisperDataDir}/ffmpeg[.exe]`
- **Modes**:
  local transcription via `whisper-cli`
  remote transcription via OpenAI when model is `"openai"`
- **IPC / events**:
  `whisper-model-status`
  `whisper-model-download`
  `whisper-model-download-cancel`
  `whisper-set-gateway-model`
  `whisper-models-list`
  `whisper-transcribe`
  event `whisper-model-download-progress`

### 2.15 analytics

- **Purpose**: local analytics consent/state persistence helper.
- **Key files**: `desktop/src/main/analytics/analytics-state.ts`.
- **Key exports**:
  `readAnalyticsState()`, `writeAnalyticsState()`.
- **Storage file**:
  `{stateDir}/analytics-state.json`
- **Important behavior**:
  stores `enabled`, `userId`, `enabledAt`, `prompted`
  as of audited commit, no file in `desktop/src/main` imports this module
- **IPC / events**: none.

### 2.16 reset

- **Purpose**: destructive local reset and relaunch.
- **Key files**: `desktop/src/main/reset/ipc.ts`.
- **Key exports**:
  `registerResetAndCloseIpcHandler()`.
- **Dependencies**: `gog/gog.clearGogAuthTokens()`, `session.defaultSession.clearStorageData()`, app relaunch.
- **Important behavior**:
  deletes `stateDir`, `logsDir`, `whisperDataDir`, and `{userData}/tmp`
  clears renderer storage
  relaunches after `25ms`, then hard-exits after `2s` fallback
- **IPC / events**:
  `reset-and-close`

## 3. Shared Types Reference

### `desktop/src/shared/desktop-bridge-contract.ts`

- `OpenclawDesktopApi`: the full preload API exposed as `window.openclawDesktop`.
- `DESKTOP_BRIDGE_KEYS`: expected method list checked by `desktop/src/preload.test.ts`.
- `DesktopPlatform`: `"darwin" | "win32" | "linux"`.
- `DesktopOpenTarget`: file-open target descriptor with `kind: "default" | "finder" | "app"`.
- Update payloads:
  `UpdateAvailablePayload`
  `UpdateDownloadProgressPayload`
  `UpdateDownloadedPayload`
  `UpdateErrorPayload`

### `desktop/src/shared/ipc-channels.ts`

- `IPC`: single source of truth for invoke channels.
- `IPC_EVENTS`: single source of truth for event channels.
- `IpcChannel`, `IpcEventChannel`: derived literal unions.
- Public event channels defined here:
  `gateway-state`
  `oauth:progress`
  `updater-available`
  `updater-download-progress`
  `updater-downloaded`
  `updater-error`
  `whisper-model-download-progress`
  `deep-link`
  `terminal:data`
  `terminal:exit`

### `desktop/src/shared/session-titles-contract.ts`

- `SessionTitleSeed`: `{ sessionKey, derivedTitle?, lastMessagePreview? }`
- `SessionTitleRecord`: `{ title, sourceHash, updatedAt }`
- `SessionTitleMap`: `Record<string, SessionTitleRecord>`

### `desktop/src/shared/types.ts`

- `ExecResult`: common result shape for CLI wrappers.
- `ObsidianVaultEntry`: parsed vault metadata.
- `CustomSkillMeta`: installed custom skill metadata.

### Cross-process types defined outside `shared/`

- `desktop/src/main/types.ts`
  `BinaryPaths`
  `GatewayState`
  `ResetAndCloseResult`
- `desktop/src/main/gog/types.ts`
  `GogExecResult`

## 4. Build And Release

### Local build flow

- `npm run dev`
  runs `electron-rebuild -f -w node-pty`, `build:all`, then `electron .`
- `npm run build`
  runs TypeScript for main/preload, executes `scripts/define-main-env.mjs`, then bundles `dist/preload.js` with esbuild
- `npm run build:renderer`
  builds the renderer with Vite
- `npm run build:all`
  builds main/preload plus renderer
- `npm run typecheck`
  checks main TS config, renderer typecheck config, and tools TS config
- `npm run check:ci`
  runs lint, prettier check, and typecheck

### Runtime preparation

- `npm run prepare:openclaw` stages the OpenClaw bundle used by Electron packaging
- `npm run prepare:runtimes` stages the Node runtime and optional helper CLIs (`gog`, `jq`, `memo`, `remindctl`, `obsidian-cli`, `gh`, `whisper-cli`)
- `npm run prepare:all` runs both

### Electron Builder configuration

- **App ID**: `ai.openspace.desktop`
- **Product name**: `OpenSpace`
- **Protocol**: `openspace://`
- **Output dir**: `desktop/release/`
- **Included files**:
  `dist/**`
  `renderer/dist/**`
  `assets/**`
  `package.json`
  `node_modules/**`
- **Extra resources**:
  app icons
  `vendor/openclaw`
  `vendor/node`
  `vendor/gog`
  `vendor/jq`
  `vendor/memo`
  `vendor/remindctl`
  `vendor/obsidian-cli`
  `vendor/gh`
  `vendor/whisper-cli`
  `.gog-runtime/credentials`
- **Publish target**: GitHub Releases via `OPENSPACE_RELEASE_GITHUB_OWNER` and `OPENSPACE_RELEASE_GITHUB_REPO`
- **mac target**: `zip`
- **win target**: `nsis`

### Packaging hooks

- `scripts/electron-builder.afterPack-sign-extra-resources.cjs`
  signs Mach-O files under bundled `extraResources` before the final app signature
- `scripts/electron-builder.afterSign-notarize.cjs`
  when `NOTARIZE=1`, zips the `.app`, calls `openclaw/scripts/notarize-mac-artifact.sh`, and staples the result
- `scripts/electron-builder.afterAllArtifactBuild-notarize-dmg.cjs`
  on macOS, rebuilds a DMG from the signed `.app`, signs the DMG itself, and optionally notarizes it
- `scripts/release.sh`
  bumps `desktop/package.json`, refreshes `desktop/package-lock.json`, commits `chore(desktop): release vX.Y.Z`, and creates annotated tag `vX.Y.Z`

### CI

#### `.github/workflows/build-desktop.yml`

- `verify` job:
  runs on `macos-latest`
  checks out submodules
  uses Node `22` and pnpm `10`
  builds OpenClaw with `pnpm build && pnpm ui:build`
  installs desktop deps with `npm ci`
  runs `npm run check:ci`
  runs `npm run build:all`
- `release` job:
  runs only for tags `v*`
  matrix: `macos-latest` (`--mac zip`) and `windows-latest` (`--win nsis`)
  prepares bundled OpenClaw and helper runtimes
  builds desktop
  on macOS CI, removes `afterAllArtifactBuild` from `desktop/package.json` before packaging
  publishes assets with `electron-builder --publish always`
  uploads `.zip`, `.dmg`, `.exe`, `.blockmap`, `.yml`

#### `.github/workflows/sync-openclaw.yml`

- scheduled every 6 hours
- fetches `openclaw` submodule `origin/main`
- commits `chore: sync openclaw submodule to latest` when it changed

## 5. Common Pitfalls

- **Do not register IPC after creating the window.** `bootstrapApp()` intentionally calls `registerIpcHandlers()` and `registerTerminalIpcHandlers()` before `ensureMainWindow()`. Changing the order causes early renderer calls to fail with missing handlers.
- **Terminal IPC is separate on purpose.** `ipc/contracts.test.ts` excludes terminal channels because `registerTerminalIpcHandlers()` is not part of `registerIpcHandlers()`.
- **`config-write` accepts strict JSON, not JSON5.** `gateway/config.ts` and migrations read config with JSON5, but `ipc/config-ipc.ts` writes only content accepted by `JSON.parse()`.
- **The gateway environment is not optional.** `spawnGateway()` injects `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, `OPENCLAW_GATEWAY_PORT`, `OPENCLAW_GATEWAY_TOKEN`, `PATH`, `GH_CONFIG_DIR`, `OPENCLAW_NO_RESPAWN`, optional `OPENAI_API_KEY`, and optional `WHISPER_CPP_MODEL`. Bypassing `spawnGateway()` breaks features silently.
- **`getPlatform()` must happen early.** On Windows it patches `child_process` globally. If you move first use later, console windows will flash for spawned commands.
- **`createMainWindow()` must keep the CSP/X-Frame-Options rewrite.** The control UI is embedded from a `file://` renderer and will fail to frame otherwise.
- **Backup restore is schema-sensitive.** If you add new path-bearing config/state fields, update `detectOldStateDir()`, `rewritePathsInDir()`, and `patchRestoredConfig()` or restored instances will point to old directories.
- **Session titles are a soft dependency on OpenAI credentials.** `ensureFriendlySessionTitles()` quietly returns cached/no titles when `resolveOpenAiApiKeyFromStateDir()` returns `null`.
- **Whisper model changes restart the gateway.** `whisper-set-gateway-model` writes `whisper-model-id`, stops the gateway, then restarts it with `{ silent: true }`.
- **Whisper model defaults are coupled awkwardly.** `desktop/src/main/whisper/model-state.ts` imports `DEFAULT_MODEL_ID` from `./ipc`, while `whisper/ipc.ts` re-exports it from `models.ts`. Moving these exports casually can introduce circular breakage.
- **Updater event coverage is asymmetric.** `updater.ts` sends `updater-checking` and `updater-not-available`, but they are not in `IPC_EVENTS` and are not exposed by preload.
- **Linux currently shares `DarwinPlatform`.** Do not assume there is a separate Linux platform class before adding OS-specific behavior.
- **`analytics-state.ts` is currently unused.** Wiring analytics needs an explicit caller; editing the file alone changes nothing.

## 6. AI Agents Quick Reference

### Before changing X, check Y

- **Boot / app lifecycle**
  check `desktop/src/main.ts`, `desktop/src/main/bootstrap/app-bootstrap.ts`, `desktop/src/main/bootstrap/app-lifecycle.ts`, `desktop/src/main/window/window-manager.ts`
- **Gateway spawn / env / ports**
  check `desktop/src/main/gateway/spawn.ts`, `desktop/src/main/gateway/lifecycle.ts`, `desktop/src/main/bootstrap/dev-global-gateway.ts`, `desktop/src/main/platform/*`
- **Gateway config schema**
  check `desktop/src/main/gateway/config.ts`, `desktop/src/main/gateway/config-migrations.ts`, `desktop/src/main/gateway/exec-approvals-migrations.ts`, `desktop/src/main/ipc/config-ipc.ts`
- **Preload or renderer-visible native API**
  check `desktop/src/shared/desktop-bridge-contract.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload.ts`, `desktop/src/preload.test.ts`, `desktop/src/main/ipc/contracts.test.ts`
- **Any new IPC channel**
  add it to `desktop/src/shared/ipc-channels.ts`
  register it in main
  expose it in `desktop/src/preload.ts` if renderer-facing
  update `OpenclawDesktopApi` / `DESKTOP_BRIDGE_KEYS` if public
  keep `preload.test.ts` and `ipc/contracts.test.ts` passing
- **Provider auth / credentials**
  check `desktop/src/main/keys/*`, `desktop/src/main/ipc/keys-ipc.ts`, `desktop/src/main/ipc/oauth-ipc.ts`, `desktop/src/main/auth/anthropic.ts`
- **File preview / external open**
  check `desktop/src/main/ipc/file-reader.ts`, `desktop/src/main/ipc/files.ts`
- **Embedded terminal**
  check `desktop/src/main/terminal/ipc.ts`, `desktop/src/main/terminal/pty-manager.ts`, `desktop/src/shared/ipc-channels.ts`
- **Whisper / voice**
  check `desktop/src/main/whisper/ipc.ts`, `desktop/src/main/whisper/models.ts`, `desktop/src/main/whisper/model-state.ts`, `desktop/src/main/whisper/ffmpeg.ts`, `desktop/src/main/gateway/spawn.ts`
- **Session title generation**
  check `desktop/src/main/session-titles/service.ts`, `desktop/src/shared/session-titles-contract.ts`, `desktop/src/main/keys/openai-api-key.ts`
- **Backup / restore / reset**
  check `desktop/src/main/ipc/backup-ipc.ts`, `desktop/src/main/ipc/backup/*`, `desktop/src/main/reset/ipc.ts`
- **Platform-specific behavior**
  check `desktop/src/main/platform/types.ts`, `desktop/src/main/platform/darwin.ts`, `desktop/src/main/platform/win32.ts`
- **Build / release / updater**
  check `desktop/package.json`, `desktop/src/main/updater.ts`, `desktop/src/main/update-splash.ts`, `.github/workflows/build-desktop.yml`, and the three Electron Builder hook scripts

### Invariants worth preserving

- The renderer must only use `window.openclawDesktop`.
- The gateway must stay loopback-bound for desktop restores and default config.
- The desktop preload contract and shared channel constants must stay synchronized.
- Main-process shutdown must stop the gateway and remove the PID file.
- Packaged builds, not the renderer, own auto-update behavior.
