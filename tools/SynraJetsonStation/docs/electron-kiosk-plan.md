# Synra Jetson Electron Kiosk Plan

Goal: run the existing Synra app in a dedicated Electron ARM64 browser shell outside snap Chromium confinement, then verify real Jetson GPU use with `tegrastats`.

Architecture:
- Keep `Synra Standalone` as the app served on port `5191`.
- Add Electron only to `SynraJetsonStation` as the kiosk process.
- Centralize launch URL and GPU switches in `src/kiosk-config.ts`.
- Keep Chromium kiosk scripts as fallback until Electron has proven better GR3D usage.

Validation:
- `npm run test:kiosk` checks URL defaults, performance overrides, and GPU command-line switches.
- `npm run typecheck` checks the TypeScript shell and diagnostics.
- `scripts/electron-gpu-check.sh` is the Jetson-side runtime check.
