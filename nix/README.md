# Nix Package for Noteban

This directory contains the Nix package definition for Noteban.

## Installation

### Using nix-build (testing)

```bash
nix-build nix/
./result/bin/noteban
```

### Using nix-shell (temporary)

```bash
nix-shell -p "(import ./nix {})"
noteban
```

### Flake-based installation

Add to your `flake.nix` inputs:

```nix
{
  inputs = {
    noteban = {
      url = "github:noteban/noteban";
      flake = false;
    };
  };
}
```

Then in your configuration:

```nix
{ pkgs, inputs, ... }:
let
  noteban = pkgs.callPackage "${inputs.noteban}/nix" {};
in
{
  environment.systemPackages = [ noteban ];
  # or for home-manager:
  # home.packages = [ noteban ];
}
```

### Direct installation with callPackage

```nix
{ pkgs, ... }:
let
  noteban = pkgs.callPackage (builtins.fetchTarball {
    url = "https://github.com/noteban/noteban/archive/main.tar.gz";
  } + "/nix") {};
in
{
  environment.systemPackages = [ noteban ];
}
```

## Updating the hash

When a new version is released, the hash in `default.nix` needs to be updated.
You can get the correct hash by running:

```bash
nix-prefetch-url https://github.com/noteban/noteban/releases/download/vX.Y.Z/Noteban_X.Y.Z_amd64.AppImage
```

Then convert to SRI format:

```bash
nix hash to-sri --type sha256 <hash>
```

## Note

This package wraps the pre-built AppImage from GitHub releases. It is only
available for `x86_64-linux`.
