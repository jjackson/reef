/**
 * Generates a bash script for per-agent Gmail setup.
 * Uploaded to /tmp/reef-email-setup.sh and run in the terminal.
 *
 * Steps:
 * 1. Resolve GCP project ID from GOG credentials or gcloud
 * 2. Authorize Gmail account via GOG (interactive OAuth)
 * 3. Configure OpenClaw Gmail webhooks for that account
 * 4. Bind the gmail channel to the specific agent in OpenClaw config
 */
export function generateEmailSetupScript(email: string, agentId: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
export GOG_KEYRING_PASSWORD="\${GOG_KEYRING_PASSWORD:-openclaw}"

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; CYAN='\\033[0;36m'; NC='\\033[0m'
ok() { echo -e "\${GREEN}  ✓ \$1\${NC}"; }
warn() { echo -e "\${YELLOW}  ! \$1\${NC}"; }
fail() { echo -e "\${RED}  ✗ \$1\${NC}"; }
step() { echo -e "\\n\${CYAN}[\$1] \$2\${NC}"; }

EMAIL="${email}"
AGENT_ID="${agentId}"

echo -e "\\n\${CYAN}Gmail Setup: \$EMAIL → agent \$AGENT_ID\${NC}\\n"

# 1. Resolve GCP project ID
step "1/4" "Resolving GCP project"
GOG_CREDS="/root/.config/gogcli/credentials.json"
GOG_PROJECT=""
if [[ -f "\$GOG_CREDS" ]]; then
  GOG_PROJECT=\$(python3 -c "import json; print(json.load(open('\$GOG_CREDS'))['installed']['project_id'])" 2>/dev/null || true)
fi
if [[ -z "\$GOG_PROJECT" ]]; then
  GOG_PROJECT=\$(gcloud config get-value project 2>/dev/null || true)
fi
if [[ -z "\$GOG_PROJECT" || "\$GOG_PROJECT" == "(unset)" ]]; then
  fail "No GCP project found. Run 'Setup Google' on the instance first."
  exit 1
fi
ok "Project: \$GOG_PROJECT"

# 2. Authorize Gmail account via GOG
step "2/4" "Authorizing \$EMAIL via GOG"
echo "  You'll need to complete the OAuth flow in your browser."
echo ""
gog auth add "\$EMAIL" --services gmail,drive,docs,sheets,calendar --manual
if [[ \$? -ne 0 ]]; then
  fail "GOG auth failed for \$EMAIL"
  exit 1
fi
ok "Authorized \$EMAIL"

# 3. Configure Gmail webhooks
step "3/4" "Setting up Gmail webhooks"
openclaw webhooks gmail setup --account "\$EMAIL" --project "\$GOG_PROJECT"
if [[ \$? -ne 0 ]]; then
  fail "Webhook setup failed"
  exit 1
fi
ok "Webhooks configured for \$EMAIL"

# 4. Bind gmail channel to agent
step "4/4" "Binding gmail:\$EMAIL → agent \$AGENT_ID"
EXISTING=\$(openclaw config get bindings --json 2>/dev/null || echo "[]")
NEW_BINDINGS=\$(python3 -c "
import json, sys
try:
    bindings = json.loads(sys.argv[1])
except (json.JSONDecodeError, IndexError):
    bindings = []
# Remove any existing binding for this email
bindings = [b for b in bindings if not (
    b.get('match', {}).get('channel') == 'gmail' and
    b.get('match', {}).get('accountId') == sys.argv[2]
)]
# Add new binding
bindings.append({
    'match': {'channel': 'gmail', 'accountId': sys.argv[2]},
    'agentId': sys.argv[3]
})
print(json.dumps(bindings))
" "\$EXISTING" "\$EMAIL" "\$AGENT_ID")

openclaw config set bindings "\$NEW_BINDINGS" --json
if [[ \$? -ne 0 ]]; then
  fail "Failed to bind gmail channel"
  exit 1
fi
ok "Bound gmail:\$EMAIL → \$AGENT_ID"

echo -e "\\n\${GREEN}Done! \$EMAIL is now connected to agent \$AGENT_ID.\${NC}"
echo -e "Run \${CYAN}openclaw webhooks gmail run\${NC} if not already running.\\n"
`
}
