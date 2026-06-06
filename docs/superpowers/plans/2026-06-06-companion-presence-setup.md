# Companion Presence Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real Synra companion foundation: first-run setup, wake-word mode settings, screen timeout, known-user enrollment, privacy controls, and smarter memory structure.

**Architecture:** Keep browser UI responsible for user setup and local preferences, while the Electron kiosk shell owns native screen/sleep controls. Store companion preferences in local storage with explicit privacy defaults and never store API keys, raw audio, or camera frames in memory.

**Tech Stack:** Vite/TypeScript frontend, Electron kiosk shell/preload IPC, localStorage settings, existing smoke tests and station config tests.

---

### Task 1: Companion Settings Schema

**Files:**
- Modify: `src/types.ts`
- Modify: `src/storage.ts`

- [ ] Add `CompanionSettings`, `KnownUserProfile`, `WakeWordMode`, and `ScreenTimeoutMinutes` types with wake word, screen timeout, privacy, setup completion, and known users.
- [ ] Add `loadCompanionSettings()` and `saveCompanionSettings()` using `synraStandalone.companionSettings.v1`.
- [ ] Default wake word to disabled, phrase to `Hey Synra`, screen timeout to `30`, and all recognition/capture features to opt-in.

### Task 2: Electron Screen Timeout Bridge

**Files:**
- Modify: `tools/SynraJetsonStation/src/kiosk-preload.ts`
- Modify: `tools/SynraJetsonStation/src/kiosk-shell.ts`
- Modify: `tools/SynraJetsonStation/tests/kiosk-config.test.mjs`

- [ ] Expose `setScreenTimeout(minutes)` and `wakeDisplay()` through `window.synraKiosk`.
- [ ] In Electron, schedule a fullscreen/kiosk window blur/minimize-friendly screen sleep action after 15, 30, 60, or never.
- [ ] Persist selected screen timeout through the web app settings, not Electron state.

### Task 3: First-Run Wizard and Settings UI

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] Add first-run wizard dialog for owner name, wake word, screen timeout, privacy, memory style, voice setup, Home Assistant future setup, and user enrollment.
- [ ] Add a nicer settings section for Companion, Privacy, Users, and Memory.
- [ ] Add `Settings > Display` screen timeout status alongside the existing fullscreen/windowed control.

### Task 4: Wake Word and User Enrollment Foundation

**Files:**
- Modify: `src/main.ts`

- [ ] Add always-listening mode that uses browser speech recognition when available and only triggers full assistant handling after the wake phrase.
- [ ] Add clear UI states: `Wake word off`, `Listening for Hey Synra`, `Awake`, and permission-needed.
- [ ] Add local known-user enrollment that captures user-approved face snapshots for profile setup, with explicit text that recognition is local/experimental and can be disabled.

### Task 5: Docs and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/jetson-install.md`
- Modify: `docs/jetson-runbook.md`
- Modify: `scripts/perf-smoke.mjs`

- [ ] Add smoke assertions for the wizard, wake-word UI, screen-timeout UI, user enrollment, and privacy language.
- [ ] Update docs with setup and privacy guidance.
- [ ] Run `npm run typecheck`, `npm --prefix tools/SynraJetsonStation run test:kiosk`, `npm run perf:smoke`, and `npm run build`.
