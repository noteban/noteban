#!/bin/bash
# Helper script to update PKGBUILD version and regenerate .SRCINFO
# Usage: ./update-pkgbuild.sh [version]
# If no version provided, reads from package.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Get version from argument or package.json
if [[ -n "$1" ]]; then
    VERSION="$1"
else
    VERSION=$(grep '"version"' ../package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
fi

echo "Updating PKGBUILD to version $VERSION"

# Update PKGBUILD version
sed -i "s/^pkgver=.*/pkgver=$VERSION/" PKGBUILD

# Generate .SRCINFO (requires makepkg)
if command -v makepkg &> /dev/null; then
    makepkg --printsrcinfo > .SRCINFO
    echo "Generated .SRCINFO"
else
    # Manual update if makepkg not available
    sed -i "s/pkgver = .*/pkgver = $VERSION/" .SRCINFO
    sed -i "s/Noteban_[0-9.]*_amd64/Noteban_${VERSION}_amd64/" .SRCINFO
    sed -i "s|/v[0-9.]*/noteban|/v$VERSION/noteban|" .SRCINFO
    echo "Updated .SRCINFO manually (makepkg not available)"
fi

echo "Done! Don't forget to update sha256sums after the release is published."
