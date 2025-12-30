#!/usr/bin/env bash
set -euo pipefail

# Read-only diagnostics to answer: "why can’t another LAN device hit :4000?"
PORT="${1:-4000}"

echo "== basic =="
date
uname -a
echo

echo "== addresses =="
ip -br a || true
echo
ip r || true
echo

echo "== listening on port ${PORT} =="
sudo ss -lntp | grep ":${PORT} " || echo "NOT LISTENING ON ${PORT}"
echo

echo "== local http checks =="
curl -sS -D - -o /dev/null "http://127.0.0.1:${PORT}/healthz" || true
echo

LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
if [[ -n "${LAN_IP}" ]]; then
  echo "Detected LAN IP: ${LAN_IP}"
  curl -sS -D - -o /dev/null "http://${LAN_IP}:${PORT}/healthz" || true
else
  echo "Could not detect LAN IP via routing."
fi
echo

echo "== firewall (ufw) =="
if command -v ufw >/dev/null 2>&1; then
  sudo ufw status verbose || true
else
  echo "ufw not installed"
fi
echo

echo "== firewall (nftables) =="
if command -v nft >/dev/null 2>&1; then
  sudo nft list ruleset || true
else
  echo "nft not installed"
fi
echo

echo "== firewall (iptables) =="
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -S || true
  sudo iptables -L -n -v || true
else
  echo "iptables not installed"
fi
echo

echo "== hint: watch for incoming attempts from Windows =="
echo "Run this while you try curl from Windows:"
echo "  sudo tcpdump -ni any port ${PORT}"


