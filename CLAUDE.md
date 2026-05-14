# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev       # Start Vite dev server (port 5173) + Electron concurrently
npm run build     # Build renderer into dist/ (index.html + preload.js)
npm run build:win # Build + package Windows NSIS installer (electron-builder)
npm start         # Run Electron directly (requires pre-built dist/)
```

No test or lint commands are configured.

## Architecture

Electron desktop app for live-editing PlantUML diagrams. Left pane: Monaco Editor for PlantUML source. Right pane: rendered SVG preview with zoom/pan. Warm-toned Q-style UI with rounded corners and soft shadows.

**Main process** (`src/main.js`):
- Creates BrowserWindow with contextIsolation enabled.
- Manages a long-lived `plantumlProcess` — a Java child process (`bin/plantuml.jar -pipe -Tsvg`) that stays open for interactive rendering. Source is written to stdin, SVG is read from stdout until `</svg>`.
- IPC handlers: `render-plantuml` (pipe to JAR), `plantuml:export-svg` (write to temp file, run JAR, native Save dialog), `plantuml:export-png` (same but with `-tpng`), `dialog:openFile`, `file:save`, `file:saveAs`.
- Serializes file/export operations with `isOperationInProgress` flag to prevent overlapping native dialogs.
- Custom Chinese application menu with File/Edit/View/Help.

**Preload** (`src/preload.js`): Exposes `window.api` via `contextBridge` — `api.plantuml.render()`, `api.plantuml.exportSvg()`, `api.plantuml.exportPng()`, `api.file.openFile()`, `api.file.saveFile()`, `api.file.saveFileAs()`, `api.app.quit()`, `api.onMenuEvent()`.

**Renderer** (`src/renderer/`): Vue 3 SPA with Composition API (`<script setup>`).
- `App.vue` — root component: PlantUML source (`code`), SVG output, zoom/pan, file path tracking, saved-content snapshot for dirty-state detection. Debounced render on code changes (500ms). Auto-fit zoom on each new SVG. Keyboard shortcut `Ctrl+S` for save. Theme selector for PlantUML `!theme` directive.
- `PlantUmlEditor.vue` — wraps Monaco Editor with a custom `plantuml` Monarch tokenizer for basic syntax highlighting.
- `plantumlExamples.js` — 7 built-in diagram templates (Sequence, Class, Use Case, Activity, Component, Deployment, State).

**Styles** (`src/assets/styles.css`): Pure CSS with CSS custom properties. Warm coral + mint green Q-style palette. Rounded corners (10-18px), soft shadows, hover lift animations.

**Vite config** special cases:
- `root` is `src/renderer`, output goes to top-level `dist/`.
- Preload is bundled as a separate rollup entry alongside the HTML entry.
- `define` sets `global` → `globalThis` and `process.platform` → `"browser"` for Monaco.
- `resolve.alias` maps `vs` to `node_modules/monaco-editor/min/vs`.
- `server.fs.allow` permits accessing project-root `assets/` from the Vite dev server.

## External dependencies (not in repo)

The app requires these files at runtime, excluded from git:
- `bin/plantuml.jar` — PlantUML Java executable
- `jre/bin/java.exe` (Windows) or `jre/bin/java` (other) — bundled JRE

Paths resolved via `getResourcePath()`: dev mode uses project root, packaged mode uses `process.resourcesPath`.

## Packaging

electron-builder config in `package.json` (`build` key):
- Windows NSIS installer (`npm run build:win`)
- `extraResources` copies `jre/` and `bin/plantuml.jar` into the packaged app
- App icon from `build/icon.ico`, generated from `assets/icon.png`
