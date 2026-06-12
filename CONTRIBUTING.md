# Contributing To NodeSpark Synra

Thank you for wanting to help improve Synra. This repo is the standalone Synra companion runtime: Jetson kiosk, Three.js/VRM avatar, local bridge APIs, Home Assistant support, optional NodeSparkHub pairing, and release-quality tooling.

Synra is source-available for evaluation and contribution, not open-source for
resale, rebranding, app-store uploads, or redistribution. Read
[LICENSE](LICENSE), [TRADEMARKS.md](TRADEMARKS.md), and
[ASSET_POLICY.md](ASSET_POLICY.md) before submitting work.

## Good First Contributions

- Jetson setup documentation improvements.
- UI polish that keeps Synra readable on desktop, tablet, and kiosk displays.
- Performance findings with clear hardware details.
- Home Assistant entity discovery and safety improvements.
- Motion, voice, and lip-sync bug reports with reproducible steps.
- Tests for existing behavior.

## Before You Start

1. Open an issue for behavior changes, UI redesigns, larger features, security-sensitive work, or anything that touches secrets, pairing, Home Assistant actions, camera, microphone, or memory.
2. Keep Synra Classic as the first/default avatar. Do not delete `.vrm` or `.vrma` assets.
3. Keep secrets out of screenshots, logs, commits, diagnostics, and issue text.
4. Preserve the Jetson path unless your change is explicitly platform-specific.
5. Do not submit copied character assets, third-party art, cloned voices,
   proprietary prompts, datasets, or media unless you have written permission to
   contribute them under this repository's terms.

## Local Setup

```bash
npm install
npm run typecheck
npm run build
npm run perf:smoke
python3 -m py_compile scripts/synra_server.py
```

Optional station checks:

```bash
npm run station:typecheck
npm run station:test
```

## Pull Request Checklist

- Describe what changed and why.
- Include screenshots or short video clips for visible UI/avatar changes.
- Mention Jetson impact when touching rendering, kiosk, deployment, services, or Python bridge code.
- Run the verification commands above and paste the results into the PR.
- Do not include API keys, Home Assistant tokens, ElevenLabs keys, NodeSpark tokens, face samples, or private device logs.
- Do not include assets, prompts, model files, voice files, screenshots, or
  generated media that you do not have permission to contribute.

## Design Rules

- Synra should feel alive, beautiful, and clear without hiding system state.
- Controls should stay usable on Jetson kiosk, browser, iPad, and smaller laptop windows.
- Smart-home and NodeSpark actions must remain explicit and confirmation-driven.
- Camera, microphone, memory, and user recognition must stay opt-in and transparent.
- Performance wins should be measured or at least described with hardware and browser/runtime details.

## Reporting Bugs

Include:

- What you expected.
- What happened.
- Exact steps to reproduce.
- Runtime: Jetson kiosk, Electron station, browser, Mac, iPhone, or iPad.
- Synra version or commit.
- Relevant non-secret logs.
- Screenshots when useful.

## Security

Please do not open public issues for vulnerabilities or exposed secrets. See [SECURITY.md](SECURITY.md).
