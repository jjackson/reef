#!/usr/bin/env bash
# Restart the reef dev server (WSL-compatible)
# Usage: ./bin/dev.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ_DIR"

# Kill whatever is on port 3002
fuser -k 3002/tcp 2>/dev/null && echo "Killed existing server on :3002" && sleep 2 || true

# Update WSL2 port forward (IP changes on each WSL restart)
WSL_IP=$(hostname -I | awk '{print $1}')
powershell.exe -c "Start-Process powershell -Verb RunAs -ArgumentList '-Command netsh interface portproxy add v4tov4 listenport=3002 listenaddress=0.0.0.0 connectport=3002 connectaddress=$WSL_IP'" 2>/dev/null && echo "Port forward: 0.0.0.0:3002 -> $WSL_IP:3002" || true

# Clear Turbopack cache
rm -rf .next
echo "Cleared .next cache"

# Bump patch version in package.json
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$CURRENT"
patch=$((patch + 1))
NEW="$major.$minor.$patch"
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" package.json
echo "Version: $CURRENT -> $NEW"

# Start dev server
echo "Starting dev server..."
exec node node_modules/next/dist/bin/next dev --port 3002 --hostname 0.0.0.0
