# Synra Standalone Blueprint

## Product

Synra Standalone is a separate companion AI assistant product. It does not replace Synra inside NodeSpark or NodeSparkHub. NodeSpark remains an optional skill/integration that Synra can connect to later.

## Locked Scope

- Talk, listen, and speak.
- Use local or cloud models.
- Remember user preferences.
- See and hear only when the user explicitly allows it.
- Control smart home devices through permissioned tools.
- Run local tools with confirmation.
- Optionally connect to NodeSpark as one skill.
- Work on Jetson first, then Mac, iPhone/iPad, and browser.

## Product Boundaries

Synra Standalone owns:

- Companion conversation.
- Voice and speech state.
- Avatar, expression, and motion state.
- Local preferences and memory.
- Model provider settings.
- Smart-home and local-device tools.
- Optional integrations, including NodeSpark.

NodeSpark owns:

- Workflow editing and execution.
- Hub pairing between NodeSpark apps.
- App Store purchase behavior.
- NodeSpark credentials, schedules, runs, and automation history.
- NodeSpark-specific confirmation gates.

## Jetson Performance Strategy

The Jetson app must be a lean Synra appliance, not the full NodeSparkHub UI.

- Render only Synra, companion controls, captions, and status.
- Use local cached avatar and motion assets.
- Avoid workflow dashboards, builder screens, debug panels, and heavy integration views.
- Target 30 FPS by default on Jetson.
- Jetson kiosk URLs should use `?profile=jetson`, which caps render work to a 30 FPS target and pixel ratio 1.
- Use adaptive pixel ratio with a hard cap.
- Disable antialiasing and shadows by default.
- Avoid post-processing, bloom, and large live overlays.
- Load one avatar and a small motion set at startup.
- Keep advanced/full motion packs opt-in.

## Architecture

```text
Synra Standalone
├─ Visual Runtime
│  ├─ Three.js / VRM avatar
│  ├─ expression state
│  ├─ speaking/listening/thinking motions
│  └─ adaptive performance controller
├─ Companion Core
│  ├─ local personality fast path
│  ├─ memory and preferences
│  ├─ model router
│  ├─ speech input/output
│  └─ tool permission policy
├─ Integrations
│  ├─ local tools
│  ├─ smart home tools
│  ├─ web/search tools
│  └─ optional NodeSpark skill
└─ Platform Shells
   ├─ Jetson kiosk
   ├─ Mac app
   ├─ iPhone/iPad app
   └─ browser/PWA
```

## Model Provider Plan

Initial provider support should use an OpenAI-compatible contract so local and cloud providers share one path:

- Ollama or llama.cpp server for local models.
- LM Studio-compatible endpoint.
- OpenAI-compatible cloud endpoints.
- Later provider adapters for Anthropic, Google, OpenRouter, xAI, and others.

Routing rules:

- Direct UI commands bypass AI.
- Small talk can use a local personality fast path before calling a model.
- Vision requests require a vision-capable model.
- Tool execution is separate from model text and requires permission checks.
- High-risk actions require confirmation.

## Memory

Memory starts local-first:

- Name and preferred form of address.
- Communication style.
- Favorite model/provider.
- Smart-home room/device aliases.
- User-approved recurring facts.

Memory must not store raw API keys, auth tokens, camera frames, raw audio, or private secrets.

## Smart Home Tools

First-class candidates:

- Home Assistant REST/WebSocket.
- Philips Hue bridge.
- Matter bridge later.
- MQTT.
- Custom webhook tool.

Smart-home tools must classify actions:

- Read-only: device list, status, room state.
- Low-risk execute: turn a light on/off, change brightness.
- Higher-risk execute: locks, garage doors, security scenes, thermostats outside normal range.

Higher-risk actions require explicit confirmation.

## NodeSpark Skill

NodeSpark is one optional skill, not a dependency.

Possible abilities:

- Check NodeSparkHub status.
- Ask Hub to explain a workflow.
- Ask Hub to draft a workflow.
- Ask Hub to run a confirmed workflow.
- Show recent run status.

Synra Standalone must still work if NodeSpark is not installed or not paired.

## What We Reuse

- Synra avatar assets.
- Synra visual state language.
- Synra speech/listening/thinking states.
- Model-routing ideas.
- Memory and redaction principles.
- Permission/confirmation philosophy.

## What We Do Not Carry Over

- Workflow builder UI.
- Hub dashboard UI.
- App Store purchase logic.
- NodeSpark run history.
- NodeSpark credential store.
- NodeSpark pairing assumptions.
- Heavy development/debug control surfaces.

## First Jetson Milestone

- Full-screen Synra kiosk runs locally.
- Avatar renders with adaptive 30 FPS target.
- Text prompt works.
- Browser speech output works.
- Listening button gracefully reports browser support.
- OpenAI-compatible model settings are stored locally for prototype use.
- Smart-home and NodeSpark tools exist as disabled/permissioned placeholders until real configuration is added.

## Success Criteria

- Cold start feels fast on Jetson.
- Avatar remains responsive while text is generated.
- UI never depends on NodeSparkHub.
- A missing model does not break Synra; she falls back to local companion behavior.
- A failed model call gives visible feedback immediately.
- User can tell when Synra is idle, listening, thinking, or speaking.
