# OpenSpace Desktop

AI Assistant desktop app powered by [OpenClaw](https://github.com/openclaw/openclaw).

## Architecture

- `desktop/` — Electron app (UI, packaging, auto-update)
- `openclaw/` — OpenClaw engine (git submodule)

## Setup

```bash
# Clone with submodules
git clone --recurse-submodules <repository-url>
cd openspace

# Install OpenClaw deps and build
cd openclaw && pnpm install && pnpm build && pnpm ui:build && cd ..

# Install Desktop deps
cd desktop && npm install

# Run in dev
npm run dev
```

## Build DMG

```bash
cd desktop && npm run dist:full
```

## Auto-Update

The app checks for updates via GitHub Releases on this repo. CI builds and publishes releases automatically when a version tag is pushed.

```bash
git tag v1.1.0
git push --tags
```
