#!/usr/bin/env bash
# Restart the reef dev server (Windows native)
# Usage: bash bin/dev_win.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ_DIR"

# Kill whatever is on port 3050
for pid in $(netstat -ano 2>/dev/null | grep ':3050.*LISTENING' | awk '{print $NF}' | sort -u); do
  taskkill //F //PID "$pid" 2>/dev/null && echo "Killed PID $pid on :3050" || true
done
sleep 1

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
echo "Starting dev server on http://localhost:3050"
exec node node_modules/next/dist/bin/next dev --port 3050
