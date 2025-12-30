#!/usr/bin/env bash
set -euo pipefail

# systemd entrypoint for mediaserver.
# Works with either:
# - system-wide Node.js (node in PATH), OR
# - nvm-managed Node.js (sources ~/.nvm/nvm.sh)

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}"

log() {
  echo "[entrypoint] $*"
}

if command -v node >/dev/null 2>&1; then
  log "Using node from PATH: $(command -v node)"
  exec node server.js
fi

NVM_SH="${HOME:-}/.nvm/nvm.sh"
if [[ -f "${NVM_SH}" ]]; then
  # shellcheck disable=SC1090
  source "${NVM_SH}"
fi

if command -v node >/dev/null 2>&1; then
  log "Using node from nvm: $(command -v node)"
  exec node server.js
fi

log "ERROR: node not found. Install Node.js system-wide, or install/configure nvm for this user."
log "Hint (system-wide, recommended for services): https://deb.nodesource.com/"
exit 127


