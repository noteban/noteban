#!/bin/bash
set -e

# Version bump script for Notes Kanban
# Usage: ./scripts/bump-version.sh <version>
# Example: ./scripts/bump-version.sh 1.5.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for version argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version number required${NC}"
    echo "Usage: $0 <version>"
    echo "Example: $0 1.5.0"
    exit 1
fi

VERSION="$1"

# Validate semver format (X.Y.Z)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: Invalid version format '$VERSION'${NC}"
    echo "Version must be in semver format: X.Y.Z (e.g., 1.5.0)"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PROJECT_ROOT/package.json" | head -1 | cut -d'"' -f4)

echo -e "${YELLOW}Bumping version from $CURRENT_VERSION to $VERSION${NC}"
echo ""

# Update package.json
echo -n "Updating package.json... "
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/package.json"
echo -e "${GREEN}done${NC}"

# Update src-tauri/Cargo.toml
echo -n "Updating src-tauri/Cargo.toml... "
sed -i '' "s/^version = \"$CURRENT_VERSION\"/version = \"$VERSION\"/" "$PROJECT_ROOT/src-tauri/Cargo.toml"
echo -e "${GREEN}done${NC}"

# Update src-tauri/Cargo.lock
echo -n "Updating src-tauri/Cargo.lock... "
cd "$PROJECT_ROOT/src-tauri"
cargo update --package notes-kanban --quiet 2>/dev/null
cd "$PROJECT_ROOT"
echo -e "${GREEN}done${NC}"

# Update src-tauri/tauri.conf.json
echo -n "Updating src-tauri/tauri.conf.json... "
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/src-tauri/tauri.conf.json"
echo -e "${GREEN}done${NC}"

# Sync package-lock.json
echo -n "Syncing package-lock.json... "
cd "$PROJECT_ROOT"
npm install --package-lock-only --silent 2>/dev/null
echo -e "${GREEN}done${NC}"

echo ""

# Git operations
echo -e "${YELLOW}Creating git commit and tag...${NC}"

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Bump version to $VERSION"
git tag -a "v$VERSION" -m "Version $VERSION"

echo ""
echo -e "${GREEN}Version bumped to $VERSION successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git show HEAD"
echo "  2. Push to remote: git push && git push --tags"
