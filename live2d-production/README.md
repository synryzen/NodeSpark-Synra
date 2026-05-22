# NodeSpark Synra Live2D Production Kit

This folder is the source-of-truth handoff for building Synra as a real Live2D
Cubism character.

Synra's target is not a moving PNG. She needs:

- Layered character art that matches the supplied NodeSpark anime reference.
- A Cubism rig with facial controls, mouth shapes, body movement, and physics.
- Exported runtime files that the Jetson monitor can load.
- A validation pass before the model is accepted into the app.

## Files

```text
ART_BRIEF.md
REFERENCE_CARD.md
COMMISSION_HANDOFF.md
HIRE_POST.md
DELIVERY_STRUCTURE.md
ACCEPTANCE_CHECKLIST.md
layer_manifest.json
rig_contract.json
```

## Production Flow

```text
reference image
  -> layered PSD art
  -> Cubism rig
  -> runtime export
  -> synra/web/assets/live2d/synra/
  -> bash synra/scripts/check_live2d_assets.sh
  -> Jetson monitor refresh
```

The exported runtime entry file must be:

```text
synra/web/assets/live2d/synra/synra.model3.json
```

The app already maps NodeSparkHub state into Live2D expressions, motion groups,
head/gaze parameters, breathing, and mouth movement.

## Build The Handoff Zip

```bash
cd synra
bash scripts/build_live2d_commission_pack.sh
```

The generated zip includes the current Synra reference image and all artist,
rigger, delivery, and validation documents.
