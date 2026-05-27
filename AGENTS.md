# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Noteban is a Tauri v2 desktop app (React 19 + Rust) for markdown note-taking with Kanban organization.

### Tooling

- **Node.js 24** and **Rust stable** are required (see `mise.toml`).
- The lockfile is `package-lock.json` — use `npm` (not pnpm/yarn).

### Running the app

Run via Tauri, not the browser — this is a native desktop app:

```sh
export DISPLAY=:1
npm run tauri dev
```

This starts both the Vite dev server (frontend HMR) and the Rust backend with a WebKit webview. The app is never intended to run standalone in a browser.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Lint | `npm run lint` |
| TypeScript check | `npx tsc -b` |
| Build frontend | `npm run build` |
| Build Rust backend | `cd src-tauri && cargo build` |
| Run app (dev) | `npm run tauri dev` |

### Linux system dependencies (Tauri/WebKit)

Required packages on Ubuntu/Debian: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`.

### Editor behavior notes

- Notes are stored as markdown files with YAML frontmatter in a user-selected directory.
- SQLite is bundled in the Rust binary (no external DB needed).
- Ollama (AI tag suggestions) is optional and not required for core functionality.

### Demo recording guidelines

When recording demo videos of Noteban:

- **Notes must start with a title.** Always type a markdown heading (e.g. `# My Note Title`) as the first line of any new note.
- **Lists auto-continue.** After typing `- ` on the first list item and pressing Enter, the editor pre-populates subsequent lines with `- `. Do NOT manually type the dash prefix on follow-up list items — just type the text content directly.

### Gotchas

- In headless/VM environments, you may see `libEGL warning: DRI3 error` — this is harmless (no GPU acceleration).
- The `PATH` must have Node 24 before `/exec-daemon/node` (which ships Node 22). Use: `export PATH="$(ls -d /home/ubuntu/.nvm/versions/node/v24.*/bin | tail -1):$PATH"`.
