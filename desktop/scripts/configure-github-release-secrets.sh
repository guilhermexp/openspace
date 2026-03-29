#!/usr/bin/env bash
set -euo pipefail

# Configure GitHub Actions secrets/variables required by OpenSpace Desktop releases.
#
# Usage examples:
#   REPO=guilhermexp/openspace \
#   CSC_P12_PATH=~/certs/DeveloperID.p12 \
#   CSC_KEY_PASSWORD='...' \
#   CSC_NAME='Developer ID Application: ...' \
#   NOTARYTOOL_KEY_PATH=~/certs/AuthKey_ABC123XYZ.p8 \
#   NOTARYTOOL_KEY_ID='ABC123XYZ' \
#   NOTARYTOOL_ISSUER='00000000-0000-0000-0000-000000000000' \
#   bash desktop/scripts/configure-github-release-secrets.sh
#
# Optional gog secret:
#   OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH=/path/to/client_secret.json

REPO="${REPO:-guilhermexp/openspace}"
NOTARIZE_VALUE="${OPENSPACE_NOTARIZE:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

set_secret_from_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    return 0
  fi
  printf "%s" "$value" | gh secret set "$name" -R "$REPO" --body -
  echo "secret set: $name"
}

set_secret_from_file() {
  local name="$1"
  local file_path="$2"
  if [[ -z "$file_path" ]]; then
    return 0
  fi
  if [[ ! -f "$file_path" ]]; then
    echo "File not found for $name: $file_path" >&2
    exit 1
  fi
  gh secret set "$name" -R "$REPO" < "$file_path"
  echo "secret set from file: $name"
}

require_cmd gh
require_cmd base64

gh auth status -h github.com >/dev/null

if [[ -n "${CSC_P12_PATH:-}" ]]; then
  if [[ ! -f "$CSC_P12_PATH" ]]; then
    echo "CSC_P12_PATH not found: $CSC_P12_PATH" >&2
    exit 1
  fi
  CSC_LINK_VALUE="$(base64 < "$CSC_P12_PATH" | tr -d '\n')"
elif [[ -n "${CSC_LINK:-}" ]]; then
  CSC_LINK_VALUE="$CSC_LINK"
else
  CSC_LINK_VALUE=""
fi

set_secret_from_value "CSC_LINK" "${CSC_LINK_VALUE:-}"
set_secret_from_value "CSC_KEY_PASSWORD" "${CSC_KEY_PASSWORD:-}"
set_secret_from_value "CSC_NAME" "${CSC_NAME:-}"

if [[ -n "${NOTARYTOOL_KEY_PATH:-}" ]]; then
  set_secret_from_file "NOTARYTOOL_KEY" "$NOTARYTOOL_KEY_PATH"
else
  set_secret_from_value "NOTARYTOOL_KEY" "${NOTARYTOOL_KEY:-}"
fi
set_secret_from_value "NOTARYTOOL_KEY_ID" "${NOTARYTOOL_KEY_ID:-}"
set_secret_from_value "NOTARYTOOL_ISSUER" "${NOTARYTOOL_ISSUER:-}"
set_secret_from_value "NOTARYTOOL_PROFILE" "${NOTARYTOOL_PROFILE:-}"

if [[ -n "${OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH:-}" ]]; then
  if [[ ! -f "$OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH" ]]; then
    echo "OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH not found: $OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH" >&2
    exit 1
  fi
  GOG_B64="$(base64 < "$OPENCLAW_GOG_OAUTH_CLIENT_SECRET_PATH" | tr -d '\n')"
  set_secret_from_value "OPENCLAW_GOG_OAUTH_CLIENT_SECRET_B64" "$GOG_B64"
elif [[ -n "${OPENCLAW_GOG_OAUTH_CLIENT_SECRET_B64:-}" ]]; then
  set_secret_from_value "OPENCLAW_GOG_OAUTH_CLIENT_SECRET_B64" "$OPENCLAW_GOG_OAUTH_CLIENT_SECRET_B64"
elif [[ -n "${OPENCLAW_GOG_OAUTH_CLIENT_SECRET_JSON:-}" ]]; then
  set_secret_from_value "OPENCLAW_GOG_OAUTH_CLIENT_SECRET_JSON" "$OPENCLAW_GOG_OAUTH_CLIENT_SECRET_JSON"
fi

gh variable set OPENSPACE_NOTARIZE -R "$REPO" --body "$NOTARIZE_VALUE"
echo "variable set: OPENSPACE_NOTARIZE=$NOTARIZE_VALUE"

echo ""
echo "Configured repo: $REPO"
echo "Current variables:"
gh variable list -R "$REPO"
