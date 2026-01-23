# Noteban AUR Package

This directory contains the PKGBUILD for submitting Noteban to the Arch User Repository (AUR).

## Installing Locally

```bash
cd aur
makepkg -si
```

## Submitting to AUR

1. Create an AUR account at https://aur.archlinux.org
2. Add your SSH key to your AUR account
3. Clone the AUR package (first time):
   ```bash
   git clone ssh://aur@aur.archlinux.org/noteban-bin.git
   ```
4. Copy PKGBUILD and .SRCINFO to the cloned repo
5. Commit and push

## Updating for New Releases

After creating a new release:

```bash
# Update version from package.json
./update-pkgbuild.sh

# Or specify version manually
./update-pkgbuild.sh 1.5.0

# Update checksum after release is published
updpkgsums  # or manually update sha256sums in PKGBUILD
makepkg --printsrcinfo > .SRCINFO
```

## Notes

- The package downloads the AppImage from GitHub releases
- AppImage filename format: `Noteban_{version}_amd64.AppImage`
- If the AppImage naming changes, update the `source` line in PKGBUILD

## First-time Setup

After your first release, verify the actual AppImage filename on the GitHub release page.
If it differs from `noteban_{version}_amd64.AppImage`, update the source URL in PKGBUILD:

```bash
# Check the actual filename, then update if needed:
source=("${pkgname}-${pkgver}.AppImage::${url}/releases/download/v${pkgver}/ACTUAL_FILENAME_HERE")
```
