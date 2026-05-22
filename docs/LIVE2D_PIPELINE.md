# NodeSpark Synra Live2D Pipeline

Synra should be a real animated Cubism character, not a moving PNG. The monitor
app is now prepared to load a Live2D model pack from:

```text
synra/web/assets/live2d/synra/synra.model3.json
```

## Source Art

Live2D needs layered source art. A flattened PNG can be used as visual
reference, but it cannot become a high-quality Cubism rig by code alone.

Build or commission a layered PSD with at least these parts:

- Background or transparent body pass.
- Back hair mass, side hair, front bangs, and individual loose strands.
- Face base, ears, neck, shoulders, chest, torso, arms, hands, and fingers.
- Left and right eye whites, irises, pupils, highlights, upper lids, lower lids,
  lashes, and brows.
- Mouth layers for closed, smile, frown, A/I/E/O/U, teeth, tongue, and shadow.
- Outfit pieces: shirt panels, collar, lace, sleeve folds, belt, NodeSpark logo,
  earrings, necklace, choker, and purple gem highlights.
- Optional physics parts for hair tips, earrings, necklace, chest, clothing
  folds, and loose sleeve edges.

The production handoff lives in `live2d-production/`. Start with
`live2d-production/ART_BRIEF.md` and `live2d-production/layer_manifest.json`.

## Rigging Targets

Minimum Synra parameter set:

```text
ParamAngleX
ParamAngleY
ParamAngleZ
ParamBodyAngleX
ParamEyeBallX
ParamEyeBallY
ParamMouthOpenY
ParamMouthForm
ParamBreath
```

Expressions:

```text
neutral
happy
attentive
focused
curious
concerned
wink
```

Motion groups:

```text
idle
listen
think
talk
success
concerned
approval
```

## Export

Export from Live2D Cubism Editor for the web/runtime SDK. Put the exported
runtime pack in `synra/web/assets/live2d/synra/` and make sure the entry file
is named `synra.model3.json`.

The app will map NodeSpark states to Live2D motions and expressions:

```text
idle -> idle + neutral
listening -> listen + attentive
thinking/workflow_running -> think + focused
speaking -> talk + current expression
success -> success + happy/wink
warning/error -> concerned + concerned
approval_needed -> approval + curious
```

## Runtime

The kiosk needs local browser runtime files in:

```text
synra/web/assets/vendor/live2d/
```

Expected files:

```text
live2dcubismcore.min.js
pixi.min.js
pixi-live2d-display.min.js
```

Install them with:

```bash
cd synra
bash scripts/install_live2d_runtime_vendor.sh
```

Once the model pack and vendor files exist, restart `nodespark-synra` or refresh
the kiosk page. The fallback PNG will disappear and the Live2D canvas will take
over the character stage.

Validate the export before deploying:

```bash
cd synra
bash scripts/check_live2d_assets.sh
```
