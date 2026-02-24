/**
 * Bash script for instance-level Google/GOG setup.
 * Uploaded to /tmp/reef-google-setup.sh and run in the terminal.
 */
export const GOOGLE_SETUP_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
export GOG_KEYRING_PASSWORD="\${GOG_KEYRING_PASSWORD:-openclaw}"

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; CYAN='\\033[0;36m'; NC='\\033[0m'
ok() { echo -e "\${GREEN}  ✓ \$1\${NC}"; }
warn() { echo -e "\${YELLOW}  ! \$1\${NC}"; }
fail() { echo -e "\${RED}  ✗ \$1\${NC}"; }
step() { echo -e "\\n\${CYAN}[\$1] \$2\${NC}"; }

echo -e "\\n\${CYAN}Google Access Setup\${NC}\\n"

# 0. Determine setup mode — existing project (reuse creds) or new project
GOG_CREDS="/root/.config/gogcli/credentials.json"
if [[ -f "\$GOG_CREDS" ]] && grep -q "client_id" "\$GOG_CREDS" 2>/dev/null; then
  SETUP_MODE="existing"
  echo -e "  Existing OAuth credentials found — will reuse them."
else
  echo "  Do you already have a GCP project with OAuth credentials?"
  echo "  If this is your first instance, choose 'new'."
  echo ""
  read -p "  Setup mode — (e)xisting project or (n)ew project? [e/n]: " mode_input
  if [[ "\$mode_input" =~ ^[Ee] ]]; then
    SETUP_MODE="existing"
  else
    SETUP_MODE="new"
  fi
fi

if [[ "\$SETUP_MODE" == "existing" ]]; then
  TOTAL=4
else
  TOTAL=6
fi

# 1. Check prerequisites
step "1/\$TOTAL" "Checking prerequisites"
MISSING=()
command -v tailscale &>/dev/null && ok "tailscale" || { fail "tailscale not installed"; MISSING+=(tailscale); }
command -v gog &>/dev/null && ok "gog" || { fail "gog not installed"; MISSING+=(gog); }
if [[ "\$SETUP_MODE" == "new" ]]; then
  command -v gcloud &>/dev/null && ok "gcloud" || { fail "gcloud not installed"; MISSING+=(gcloud); }
fi

if [[ \${#MISSING[@]} -gt 0 ]]; then
  echo ""
  read -p "  Install missing tools (\${MISSING[*]})? [Y/n]: " do_install
  if [[ "\$do_install" =~ ^[Nn] ]]; then
    fail "Cannot continue without: \${MISSING[*]}"
    exit 1
  fi
  for tool in "\${MISSING[@]}"; do
    case "\$tool" in
      gcloud)
        echo "  Installing Google Cloud CLI..."
        apt-get update -qq && apt-get install -y -qq apt-transport-https ca-certificates gnupg curl
        curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
        echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list
        apt-get update -qq && apt-get install -y -qq google-cloud-cli
        ok "gcloud installed"
        ;;
      gog)
        echo "  Installing GOG CLI (GitHub binary — re-run setup to update)..."
        ARCH=\$(dpkg --print-architecture)
        GOG_URL=\$(curl -fsSL https://api.github.com/repos/steipete/gogcli/releases/latest | grep "browser_download_url.*linux.*\$ARCH" | head -1 | cut -d '"' -f 4)
        if [[ -z "\$GOG_URL" ]]; then
          fail "Could not find gog release for \$ARCH — install manually from https://github.com/steipete/gogcli/releases"
          exit 1
        fi
        curl -fsSL "\$GOG_URL" -o /tmp/gog.tar.gz
        tar -xzf /tmp/gog.tar.gz -C /usr/local/bin gog 2>/dev/null || tar -xzf /tmp/gog.tar.gz -C /usr/local/bin
        chmod +x /usr/local/bin/gog
        rm -f /tmp/gog.tar.gz
        ok "gog installed"
        ;;
      tailscale)
        echo "  Installing Tailscale (via official apt repo)..."
        curl -fsSL https://tailscale.com/install.sh | sh
        ok "tailscale installed"
        ;;
    esac
  done
fi

# 2. Tailscale
step "2/\$TOTAL" "Tailscale"
if tailscale status &>/dev/null 2>&1 && ! tailscale status 2>&1 | grep -q "Logged out"; then
  ok "Connected"
else
  echo "  Tailscale provides HTTPS endpoint for Gmail webhooks."
  echo "  Get auth key: https://login.tailscale.com/admin/settings/keys"
  read -p "  Auth key (or Enter to skip): " ts_key
  if [[ -n "\$ts_key" ]]; then
    tailscale up --authkey "\$ts_key" && ok "Connected" || warn "Auth failed"
  else
    warn "Skipped — Gmail webhooks won't work without Tailscale"
  fi
fi

STEP=3

if [[ "\$SETUP_MODE" == "new" ]]; then
  # 3. gcloud auth (new project only)
  step "\$STEP/\$TOTAL" "Google Cloud authentication"
  if gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q "@"; then
    ok "Authenticated as \$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
  else
    echo "  Running headless auth (copy command to local machine)..."
    gcloud auth login --no-browser
    # flush any leftover stdin from the interactive auth flow
    read -t 0.1 -n 10000 discard 2>/dev/null || true
  fi
  STEP=\$((STEP + 1))

  # 4. Google Cloud Terms of Service (new project only)
  step "\$STEP/\$TOTAL" "Google Cloud Terms of Service"
  ACCOUNT=\$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
  TOS_CHECK=\$(gcloud projects list --format="value(projectId)" 2>&1 || true)
  if echo "\$TOS_CHECK" | grep -qi "terms of service\\|tos"; then
    echo "  You must accept the Google Cloud Terms of Service before continuing."
    echo "  Open this URL in your browser, sign in as \$ACCOUNT, and accept:"
    echo ""
    echo "    https://console.cloud.google.com/"
    echo ""
    read -p "  Press Enter once you've accepted the ToS..." _tos_wait
    TOS_RETRY=\$(gcloud projects list --format="value(projectId)" 2>&1 || true)
    if echo "\$TOS_RETRY" | grep -qi "terms of service\\|tos"; then
      fail "ToS still not accepted — cannot continue"
      exit 1
    fi
    ok "Terms of Service accepted"
  else
    ok "Terms of Service accepted"
  fi
  STEP=\$((STEP + 1))
fi

# GCP project + APIs / OAuth credentials
step "\$STEP/\$TOTAL" "GOG OAuth credentials"
STEP=\$((STEP + 1))

if [[ "\$SETUP_MODE" == "new" ]]; then
  # New project flow: create project, enable APIs, then get OAuth creds
  PROJECT=\$(gcloud config get-value project 2>/dev/null)
  if [[ -n "\$PROJECT" && "\$PROJECT" != "(unset)" ]]; then
    APIS=\$(gcloud services list --enabled --format="value(config.name)" 2>/dev/null)
    if echo "\$APIS" | grep -q "gmail.googleapis.com" && echo "\$APIS" | grep -q "pubsub.googleapis.com"; then
      ok "Project '\$PROJECT' with APIs enabled"
    else
      echo "  Enabling APIs..."
      gcloud services enable gmail.googleapis.com pubsub.googleapis.com sheets.googleapis.com drive.googleapis.com docs.googleapis.com calendar-json.googleapis.com
      ok "APIs enabled"
    fi
  else
    echo "  No project set. Your projects:"
    gcloud projects list --format="table(projectId,name)" 2>/dev/null || true
    read -p "  Enter project ID (or 'new'): " proj
    if [[ "\$proj" == "new" ]]; then
      DEFAULT="openclaw-assistant-\$(date +%Y%m%d)"
      read -p "  Project ID [\$DEFAULT]: " input_proj
      proj="\${input_proj:-\$DEFAULT}"
      gcloud projects create "\$proj" --name="OpenClaw Assistant" || true
    fi
    gcloud config set project "\$proj"
    gcloud services enable gmail.googleapis.com pubsub.googleapis.com sheets.googleapis.com drive.googleapis.com docs.googleapis.com calendar-json.googleapis.com
    ok "Project '\$proj' configured"
  fi

  # Now get OAuth credentials
  gog auth keyring file 2>/dev/null || true
  if [[ -f "\$GOG_CREDS" ]] && grep -q "client_id" "\$GOG_CREDS" 2>/dev/null; then
    ok "OAuth credentials already configured"
  else
    echo "  Create OAuth credentials at: https://console.cloud.google.com/apis/credentials"
    echo "  Type: Desktop app. Copy Client ID and Secret."
    read -p "  Client ID: " cid
    read -p "  Client Secret: " csecret
    if [[ -n "\$cid" && -n "\$csecret" ]]; then
      mkdir -p /root/.config/gogcli
      proj=\$(gcloud config get-value project 2>/dev/null || echo "unknown")
      cat > "\$GOG_CREDS" << CREDEOF
{"installed":{"client_id":"\${cid}","project_id":"\${proj}","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","client_secret":"\${csecret}","redirect_uris":["http://localhost"]}}
CREDEOF
      gog auth credentials set "\$GOG_CREDS" 2>/dev/null || true
      ok "Credentials saved"
    else
      warn "Skipped — GOG won't work without OAuth credentials"
    fi
  fi
else
  # Existing project flow: just need OAuth client ID and secret
  if [[ -f "\$GOG_CREDS" ]] && grep -q "client_id" "\$GOG_CREDS" 2>/dev/null; then
    ok "OAuth credentials already configured"
  else
    echo "  Enter the OAuth credentials from your existing GCP project."
    echo "  (Find them at: GCP Console > APIs & Services > Credentials)"
    read -p "  Client ID: " cid
    read -p "  Client Secret: " csecret
    read -p "  GCP Project ID: " proj
    if [[ -n "\$cid" && -n "\$csecret" && -n "\$proj" ]]; then
      mkdir -p /root/.config/gogcli
      cat > "\$GOG_CREDS" << CREDEOF
{"installed":{"client_id":"\${cid}","project_id":"\${proj}","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","client_secret":"\${csecret}","redirect_uris":["http://localhost"]}}
CREDEOF
      gog auth credentials set "\$GOG_CREDS" 2>/dev/null || true
      ok "Credentials saved"
    else
      warn "Skipped — GOG won't work without OAuth credentials"
    fi
  fi
fi

if ! grep -q "GOG_KEYRING_PASSWORD" /etc/environment 2>/dev/null; then
  echo 'GOG_KEYRING_PASSWORD=openclaw' >> /etc/environment
fi

# Tailscale Funnel
step "\$STEP/\$TOTAL" "Tailscale Funnel"
if tailscale funnel status &>/dev/null 2>&1; then
  ok "Funnel available"
else
  echo "  Enable at: https://login.tailscale.com/admin/dns (HTTPS certs)"
  echo "  And: https://login.tailscale.com/admin/acls (Funnel policy)"
  warn "Funnel may not be enabled — check links above"
fi

echo -e "\\n\${GREEN}Done! Now use 'Setup Email' on each agent to connect Gmail accounts.\${NC}\\n"
`
