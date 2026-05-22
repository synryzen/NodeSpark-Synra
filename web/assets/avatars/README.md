# Synra VRM Avatar Slot

Put the production Synra VRoid/VRM export here:

```text
web/assets/avatars/synra.vrm
```

The monitor UI boots a real-time Three.js avatar layer. If `synra.vrm` is
present, it loads that model through the VRM runtime and hides the PNG fallback.
If it is missing, Synra keeps using the reactive PNG pose fallback until the VRM
file is added.

Recommended VRoid export notes:

- Export as VRM 1.0 when possible.
- Keep the first version lightweight for Jetson: one character mesh, compressed
  textures, no huge 4K materials.
- Include standard expressions or blendshapes for `happy`, `sad`, `relaxed`,
  `surprised`, `blink`, and `aa`.
- Include standard humanoid bones for head, neck, chest, spine, upper arms,
  and spring bones for hair/accessories.
- Keep spring bones for hair/accessories modest; too many secondary bones can
  cost frames on the Orin Nano kiosk.
