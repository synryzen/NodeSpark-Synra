# Synra Frame Animation Pipeline

Synra's primary visual path is now classic frame animation: same-size PNG
frames played directly in the browser.

## Runtime Format

Frame animations live here:

```text
web/assets/synra/frame-animations/
```

Each animation has one folder:

```text
idle/frame-000.png
idle/frame-001.png
idle/frame-002.png
...
speaking/frame-000.png
speaking/frame-001.png
...
```

All frames are normalized to the same canvas size. The current generated pass is
`768x768`.

The browser reads:

```text
web/assets/synra/frame-animations/manifest.json
```

The manifest maps assistant states to frame folders, frame counts, FPS, and
whether the animation loops.

## Build Frames

Rebuild the normalized animation folders from the current cel source folders:

```bash
bash scripts/build_synra_frame_sequences.sh
```

The current script uses:

- `cels/transitions` for idle, thinking, workflow, waiting, reading.
- `cels/facial` for speaking.
- `cels/reactions` for listening, success, approval, alerts, and misunderstandings.

## Better Source Art

For production, replace the generated cel folders with higher-resolution Synra
drawings before running the build script. The important rule is consistency:

- same canvas size
- same character scale
- same camera framing
- same background or transparent background
- enough in-between frames for smooth motion

Recommended first target:

- 24-36 frames for idle breathing/blinking
- 24-48 frames for speaking mouth cycles
- 18-30 frames for listening
- 18-30 frames for thinking
- 12-24 frames for reactions like success, confused, alert, approval

The browser can handle more frames; the main cost is disk size and preload time.
