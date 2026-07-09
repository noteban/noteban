---
name: verify
description: Verify noteban editor changes at a real rendered surface without launching the Tauri app — mount CodeMirror plugins in headless Chromium and screenshot.
---

# Verifying noteban changes

Noteban is a Tauri v2 app; `npm run tauri dev` launches a native window (assume the
user's dev instance is already running — don't start another). The frontend cannot
boot standalone in a browser (Tauri `invoke` calls fail before the editor renders).

## Editor-plugin changes (CodeMirror decorations, themes, keymaps)

CM6 plugins can be observed in a plain browser page without Tauri:

1. Create `.verify-harness/main.ts` in the repo (must live inside the repo so
   `@codemirror/*` resolves from its node_modules). Import the plugin(s) under test
   plus `EditorView` and mount one editor per scenario; `view.dispatch()` a change
   to exercise the `update()` path. Assert doc integrity into a `#status` div.
2. `.verify-harness/index.html`: dark `#1e1e2e` body, mount divs, `<script src="bundle.js">`.
3. Bundle (absolute paths required — relative entry fails to resolve):
   `npx rolldown "$PWD/.verify-harness/main.ts" -o "$PWD/.verify-harness/bundle.js" -f iife -p browser`
4. Screenshot with Playwright's cached headless shell (no install needed):
   `~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell --headless --disable-gpu --hide-scrollbars --screenshot=$PWD/.verify-harness/shot.png --window-size=860,1600 --virtual-time-budget=3000 "file://$PWD/.verify-harness/index.html"`
   For text assertions use `--dump-dom` and grep instead.
5. Read the PNG, then `rm -rf .verify-harness` — never commit it.

## Non-editor changes (stores, Tauri commands, layout)

No headless recipe exists yet; these need the running app. Ask the user to check
their dev instance, or record what you'd need and extend this skill.

## Gotchas

- `npm test` without the repo's `vitest.config.ts` sweeps up 190 broken test files
  from the `.trunk` plugin cache — the config's `include: ['src/**/*.test.{ts,tsx}']`
  is load-bearing.
- Pre-existing lint failures on main (SettingsModal set-state-in-effect error,
  MarkdownEditor unused-directive warning) — don't attribute them to your diff;
  compare with `git stash && npm run lint && git stash pop`.
