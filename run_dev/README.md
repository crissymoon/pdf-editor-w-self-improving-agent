# run_dev

Quick-launch scripts for development and preview. Each script changes into the project root automatically so they can be double-clicked or run from any working directory.

## Scripts

| Script pair | What it does |
|---|---|
| `dev-browser` | Starts the Vite dev server with hot-reload at http://localhost:5173 |
| `dev-electron` | Starts Vite + Electron together with hot-reload |
| `preview-browser` | Builds then serves the production bundle at http://localhost:4173 |
| `run-electron` | Launches Electron against the current `dist/` build (no rebuild) |

Each mode has a `.sh` (macOS/Linux) and a `.bat` (Windows) variant.

## Usage

**Windows**
```
run_dev\dev-electron.bat
run_dev\dev-browser.bat
```

**macOS / Linux**
```bash
bash run_dev/dev-electron.sh
bash run_dev/dev-browser.sh
```
