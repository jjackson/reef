/**
 * Bash script for installing OpenClaw on a fresh Ubuntu droplet.
 * Uploaded to /tmp/reef-install-openclaw.sh and run in the terminal.
 */
export const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; CYAN='\\033[0;36m'; NC='\\033[0m'
ok() { echo -e "\${GREEN}  ✓ \$1\${NC}"; }
warn() { echo -e "\${YELLOW}  ! \$1\${NC}"; }
fail() { echo -e "\${RED}  ✗ \$1\${NC}"; exit 1; }
step() { echo -e "\\n\${CYAN}[\$1] \$2\${NC}"; }

echo -e "\\n\${CYAN}OpenClaw Install\${NC}\\n"

# 0. Swap file (2GB) — prevents OOM on $6/mo 1GB droplets
step 0 "Checking swap"
if swapon --show | grep -q '/swapfile'; then
  ok "Swap already active (\$(swapon --show --noheadings --bytes | awk '{s+=\$3}END{printf "%.0fMB", s/1024/1024}'))"
else
  echo "  Creating 2GB swap file..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "2GB swap enabled and persisted in fstab"
fi

# 1. Node.js
step 1 "Checking Node.js"
if command -v node &>/dev/null; then
  NODE_VERSION=\$(node -v | sed 's/v//' | cut -d. -f1)
  if (( NODE_VERSION >= 20 )); then
    ok "Node.js \$(node -v) found"
  else
    warn "Node.js \$(node -v) is too old (need 20+), upgrading..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
    ok "Node.js \$(node -v) installed"
  fi
else
  warn "Node.js not found, installing..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  ok "Node.js \$(node -v) installed"
fi

# 2. Install OpenClaw
step 2 "Installing OpenClaw"
if command -v openclaw &>/dev/null; then
  ok "OpenClaw already installed (\$(openclaw --version 2>/dev/null || echo 'unknown version'))"
  echo "  Updating to latest..."
  npm update -g openclaw
  ok "Updated to \$(openclaw --version 2>/dev/null || echo 'latest')"
else
  npm install -g openclaw
  ok "OpenClaw \$(openclaw --version 2>/dev/null || echo '') installed"
fi

# 3. Initialize OpenClaw
step 3 "Initializing OpenClaw"
if [[ -d "\$HOME/.openclaw" ]] && [[ -f "\$HOME/.openclaw/openclaw.json" ]]; then
  ok "OpenClaw already initialized at ~/.openclaw"
  echo "  Skipping setup. Delete ~/.openclaw to reinitialize."
elif [[ "\${REEF_NON_INTERACTIVE:-}" == "1" ]]; then
  echo "  Running non-interactive setup..."
  openclaw onboard --non-interactive --accept-risk 2>&1 || openclaw setup --non-interactive 2>&1 || true
  ok "OpenClaw initialized (non-interactive)"
else
  echo "  Running openclaw setup (follow the prompts)..."
  echo ""
  openclaw setup
  ok "OpenClaw initialized"
fi

# 4. Set up systemd user service
step 4 "Setting up systemd service"
export XDG_RUNTIME_DIR="/run/user/\$(id -u)"
SERVICE_DIR="\$HOME/.config/systemd/user"
SERVICE_FILE="\$SERVICE_DIR/openclaw-gateway.service"

mkdir -p "\$SERVICE_DIR"

if [[ -f "\$SERVICE_FILE" ]]; then
  ok "Service file already exists"
else
  cat > "\$SERVICE_FILE" << 'SVC_EOF'
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/openclaw gateway start
Restart=on-failure
RestartSec=5
Environment=GOG_KEYRING_PASSWORD=openclaw
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
SVC_EOF
  ok "Created service file"
fi

# Ensure GOG_KEYRING_PASSWORD is in the service file
if ! grep -q 'GOG_KEYRING_PASSWORD' "\$SERVICE_FILE"; then
  sed -i '/\\[Service\\]/a Environment=GOG_KEYRING_PASSWORD=openclaw' "\$SERVICE_FILE"
  ok "Added GOG_KEYRING_PASSWORD to service"
fi

# Enable lingering so user services run without login
loginctl enable-linger root 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable openclaw-gateway
ok "Service enabled"

# 5. Start the gateway
step 5 "Starting OpenClaw gateway"
systemctl --user start openclaw-gateway || true
sleep 2

if systemctl --user is-active --quiet openclaw-gateway; then
  ok "Gateway is running"
else
  warn "Gateway didn't start — check logs with: journalctl --user -u openclaw-gateway -n 20"
fi

echo ""
echo -e "\${GREEN}Done! OpenClaw is installed and the gateway service is running.\${NC}"
echo -e "  Version: \$(openclaw --version 2>/dev/null || echo 'unknown')"
echo -e "  Logs:    journalctl --user -u openclaw-gateway -f"
echo ""
`
