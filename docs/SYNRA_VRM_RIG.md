# Synra VRM Rig

Synra's final monitor avatar should be a VRM character loaded from:

```text
web/assets/avatars/synra.vrm
```

When that file exists, the browser uses `web/avatar3d-driver.js` as the primary
visual renderer. The PNG pose renderer remains only as a fallback.

## Required Model Features

- Adult anime character matching the Synra reference art.
- VRM 1.0 preferred; VRM 0.x is acceptable if Three VRM can load it.
- Standard humanoid bones: head, neck, chest, spine, and upper arms.
- Expressions or blendshapes: `happy`, `sad`, `relaxed`, `surprised`, `blink`,
  and `aa`.
- Lightweight materials for Jetson: avoid huge 4K textures on the first pass.
- Modest spring bones for hair, earrings, necklace, and clothing.

## Runtime Behaviors

The current driver maps NodeSparkHub/Synra state into:

- idle breathing, blink, and autonomous gaze
- listening posture when the microphone is active
- thinking and workflow focus
- speaking mouth movement and small nods
- happy/success expression
- curious/approval expression
- concerned/sad/error expression
- camera/pointer-driven head tracking when available

## Install

Copy the exported model here:

```bash
cp /path/to/Synra.vrm web/assets/avatars/synra.vrm
```

Then deploy or sync the repo to the Jetson and restart:

```bash
systemctl --user restart nodespark-synra
```

The monitor will hide the PNG fallback automatically after the VRM reports
ready.
