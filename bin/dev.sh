#!/usr/bin/env bash
# Restart the reef dev server (WSL-compatible)
# Usage: ./bin/dev.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ_DIR"

# Kill whatever is on port 3000
fuser -k 3000/tcp 2>/dev/null && echo "Killed existing server on :3000" && sleep 2 || true

# Clear Turbopack cache (WSL doesn't get inotify events from /mnt/c)
rm -rf .next
echo "Cleared .next cache"

# Bump patch version in package.json
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$CURRENT"
patch=$((patch + 1))
NEW="$major.$minor.$patch"
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" package.json
echo "Version: $CURRENT -> $NEW"

# Start with polling enabled for WSL
echo "Starting dev server..."
WATCHPACK_POLLING=true exec node node_modules/next/dist/bin/next dev
