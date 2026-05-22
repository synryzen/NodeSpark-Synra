# Synra Commission Handoff

Use this when handing the project to an artist or Live2D rigger.

## Short Brief

Create and rig NodeSpark Synra, an original adult anime AI operator for
NodeSparkHub. She should closely follow the supplied reference image: long black
hair, violet eyes, black NodeSparkHub outfit, purple jewelry accents, confident
soft expression, and premium developer-studio energy.

The final delivery must be a Live2D Cubism runtime model for web:

```text
synra.model3.json
synra.moc3
textures/*.png
motions/*.motion3.json
expressions/*.exp3.json
physics3.json
pose3.json
```

## Deliverables

- Layered PSD source art.
- Cubism project source.
- Exported runtime model pack.
- All texture files.
- Motion files for every required group.
- Expression files for every required expression.
- Notes for any optional features that were skipped.

## Required Expressions

```text
neutral
happy
attentive
focused
curious
concerned
wink
```

## Required Motion Groups

```text
idle
listen
think
talk
success
concerned
approval
```

## Required Parameters

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

## Runtime Acceptance

The finished pack must pass:

```bash
cd synra
bash scripts/check_live2d_assets.sh
```

The model should load in the Jetson browser without relying on remote CDNs.
