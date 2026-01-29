#!/bin/bash
set -e

# Version bump script for Noteban
# Usage: ./scripts/bump-version.sh <version>
# Example: ./scripts/bump-version.sh 1.5.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cross-platform sed in-place edit (macOS uses BSD sed, Linux uses GNU sed)
sed_inplace() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

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

# Ensure we're on main and up-to-date before making any changes
echo -e "${YELLOW}Switching to main branch...${NC}"
git fetch origin
git checkout main
git pull origin main
echo ""

# Get current version from package.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PROJECT_ROOT/package.json" | head -1 | cut -d'"' -f4)

echo -e "${YELLOW}Bumping version from $CURRENT_VERSION to $VERSION${NC}"
echo ""

# Update package.json
echo -n "Updating package.json... "
sed_inplace "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/package.json"
echo -e "${GREEN}done${NC}"

# Update src-tauri/Cargo.toml
echo -n "Updating src-tauri/Cargo.toml... "
sed_inplace "s/^version = \"$CURRENT_VERSION\"/version = \"$VERSION\"/" "$PROJECT_ROOT/src-tauri/Cargo.toml"
echo -e "${GREEN}done${NC}"

# Update src-tauri/Cargo.lock
echo -n "Updating src-tauri/Cargo.lock... "
cd "$PROJECT_ROOT/src-tauri"
cargo update --package noteban --quiet 2>/dev/null
cd "$PROJECT_ROOT"
echo -e "${GREEN}done${NC}"

# Update src-tauri/tauri.conf.json
echo -n "Updating src-tauri/tauri.conf.json... "
sed_inplace "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/src-tauri/tauri.conf.json"
echo -e "${GREEN}done${NC}"

# Sync package-lock.json
echo -n "Syncing package-lock.json... "
cd "$PROJECT_ROOT"
npm install --package-lock-only --silent 2>/dev/null
echo -e "${GREEN}done${NC}"

# Update aur/PKGBUILD
echo -n "Updating aur/PKGBUILD... "
sed_inplace "s/^pkgver=.*/pkgver=$VERSION/" "$PROJECT_ROOT/aur/PKGBUILD"
echo -e "${GREEN}done${NC}"

echo ""

# Git operations
BRANCH_NAME="release/v$VERSION"

# Check if branch already exists locally or remotely
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo -e "${RED}Error: Branch $BRANCH_NAME already exists locally${NC}"
    exit 1
fi

if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
    echo -e "${RED}Error: Branch $BRANCH_NAME already exists on remote${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating release branch and PR...${NC}"

# Create and switch to release branch
git checkout -b "$BRANCH_NAME"

# Stage and commit changes
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json aur/PKGBUILD
git commit -m "Bump version to $VERSION"

# Push branch to remote
git push -u origin "$BRANCH_NAME"

# Create PR using gh CLI
if command -v gh &> /dev/null; then
    if PR_URL=$(gh pr create \
        --title "Release v$VERSION" \
        --body "Bumps version to $VERSION" \
        --label "release" \
        --base main 2>&1); then
        echo -e "${GREEN}Pull request created: $PR_URL${NC}"
    else
        echo -e "${RED}Failed to create PR: $PR_URL${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}gh CLI not found. Create the PR manually.${NC}"
fi

echo ""
echo -e "${GREEN}Version bump to $VERSION prepared!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review and merge the PR"
echo "  2. Tag will be created automatically after merge"
