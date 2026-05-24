# Build Synra In Live2D Now

This is the working path for replacing the temporary VRM avatar with the real
Synra Live2D model.

## Current State

The app is ready for Live2D runtime files, but the actual Synra Cubism export
does not exist yet:

```text
web/assets/live2d/synra/synra.model3.json
```

Until that file exists, the monitor intentionally keeps using the VRM fallback.

## Workspace

Use this folder while building the character:

```text
live2d-production/workspace/
  source/    layered PSD art and reference notes
  project/   Cubism .cmo3 project files
  runtime/   Cubism runtime export before install
  preview/   screenshots and test notes
```

The current VRM fallback screenshot is saved here for comparison:

```text
live2d-production/references/current-vrm-fallback.jpg
```

The approved final Synra design references are:

```text
live2d-production/references/synra-final-design-neutral.png
live2d-production/references/synra-final-design-wave.png
```

Use `synra-final-design-neutral.png` as the base pose for the Live2D source
art, and use `synra-final-design-wave.png` as the wave anatomy target.

## Required Source Art

Cubism needs layered character art. A flat PNG or the current VRM cannot be
turned into a polished Live2D rig automatically.

Minimum source file:

```text
live2d-production/workspace/source/synra.psd
```

The PSD must be redrawn and separated from:

```text
live2d-production/workspace/source/synra-final-design-neutral.png
```

The PSD should follow:

```text
live2d-production/ART_BRIEF.md
live2d-production/layer_manifest.json
```

## Required Cubism Export

Export the finished runtime package from Cubism into:

```text
live2d-production/workspace/runtime/
```

The runtime folder must contain:

```text
synra.model3.json
synra.moc3
textures/
motions/
expressions/
physics3.json
```

## Install Into The App

After exporting from Cubism:

```bash
bash scripts/install_live2d_model_pack.sh live2d-production/workspace/runtime
bash scripts/check_live2d_assets.sh
```

When the check passes, the monitor will load Live2D and hide the temporary VRM.

## Quality Bar

Do not accept the rig until the wave is anatomically correct:

- upper arm beside the body, slightly forward
- forearm in front of the upper arm
- elbow joint continuous, no crack
- wrist straight and relaxed
- palm facing the screen
- thumb side toward the cheek, pinky side outward
- fingers spread cleanly

The same quality bar applies to explain, stretch, idle movement, facial
expressions, hair physics, and dress motion.
