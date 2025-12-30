#!/usr/bin/env bash
set -euo pipefail

# Installs the systemd instance unit:
#   mediaserver@<user>.service
#
# Usage:
#   ./scripts/install-systemd.sh            # installs for current user
#   sudo ./scripts/install-systemd.sh USER  # installs for USER
#
# Then manage with:
#   sudo systemctl enable --now mediaserver@<user>

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_USER="${1:-${SUDO_USER:-${USER}}}"

if [[ -z "${TARGET_USER}" ]]; then
  echo "Could not determine target user. Pass it explicitly: $0 <user>" >&2
  exit 1
fi

UNIT_SRC="${REPO_DIR}/mediaserver@.service"
UNIT_DST="/etc/systemd/system/mediaserver@.service"

if [[ ! -f "${UNIT_SRC}" ]]; then
  echo "Missing unit file: ${UNIT_SRC}" >&2
  exit 1
fi

echo "Installing systemd unit:"
echo "- from: ${UNIT_SRC}"
echo "- to:   ${UNIT_DST}"
sudo cp "${UNIT_SRC}" "${UNIT_DST}"

echo "Ensuring entrypoint is executable..."
chmod +x "${REPO_DIR}/scripts/systemd-entrypoint.sh"

echo "Reloading systemd..."
sudo systemctl daemon-reload

echo "Enabling + starting: mediaserver@${TARGET_USER}"
sudo systemctl enable --now "mediaserver@${TARGET_USER}"

echo
echo "Status:"
sudo systemctl status "mediaserver@${TARGET_USER}" --no-pager

echo
echo "Tail logs:"
echo "  sudo journalctl -u mediaserver@${TARGET_USER} -f -n 200"


