# OpenSpace Desktop — Changelog

Todas as mudanças notáveis do projeto.

## v1.0.82 (2026-04-06)

### Fixes
- Gateway config streaming migration for legacy channel format (#2) (6b3ffb7)
- TypeScript build error: added missing `scheduler` and `runtimeProfile` to discord proxy-request-client (4fe5cd4)

### Documentation
- Comprehensive ARCHITECTURE.md covering all 16 modules, IPC channels, boot sequence, and AI agent quick reference (99f3da1)

### OpenClaw
- Submodule synced to latest with CI fix

## v1.0.81 (2026-04-06)

_Hotfix release — auto-update and changelog improvements._

## v1.0.80 (2026-04-06)

_Auto-update reliability fixes and UX improvements._

## v1.0.79 (2026-04-06)

### Features
- AI-generated session titles no sidebar (eeeefc3)
- Action log collapse, TTS audio cache, sidebar resize, abort streaming (ac00e10)
- Clickable file paths no markdown via remarkFileLinks plugin (1b71fc7)
- WAV recorder migrado para AudioWorklet (performance melhor) (85fe078)
- TTS tool results agora matcheiam por toolCallId (isolamento de audio) (1d659aa)
- OpenAI TTS API key passada automaticamente pro gateway (13c3e56)

### Fixes
- Race condition no GatewayClient durante handshake (67e7555)
- AudioPlayer debug logging para troubleshooting (486cadb)
- remarkFileLinks removido temporariamente e re-adicionado com fix (21b7cab)

### CI
- Release alignment + CI fixes para builds Mac/Windows (#1) (7eca64e)
- Runtime fetches non-fatal, optional runtime dirs, DMG hook disabled (ed43934..74a7265)

### Other
- Branding atualizado: Codex branding + 1Code visual language (35d8569, 76d33b2)
- Telegram logo atualizado (cc91da4)
- OpenClaw atualizado para v2026.4.1

## v1.0.78 (2026-04-01)

_Release inicial com CI funcional._
