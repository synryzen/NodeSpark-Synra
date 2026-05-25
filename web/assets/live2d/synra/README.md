# Synra Live2D Runtime Slot

This directory is the browser runtime slot for Synra's Live2D avatar.

The app loads:

```text
synra.model3.json
```

Current status:

- A real Cubism runtime scaffold is installed from the official Live2D sample
  model Hiyori.
- The texture atlas has been recolored toward Synra's dark hair and blue/purple
  styling so the app uses a real moving Live2D model while the custom Synra
  Cubism model is built.
- The approved Synra concept art remains in this folder as design reference.

The installed scaffold includes the real Live2D files the app needs:

```text
Hiyori.moc3
Hiyori.physics3.json
Hiyori.pose3.json
Hiyori.userdata3.json
Hiyori.2048/*.png
motions/*.motion3.json
```

Install a finished custom Cubism export with:

```bash
bash scripts/install_live2d_model_pack.sh /path/to/runtime-or-delivery-folder
```

Source and license notes:

- Source: Live2D Cubism Web Samples, `Samples/Resources/Hiyori`.
- License text copied to `LIVE2D_SAMPLE_LICENSE.md`.
- Replace this scaffold with a custom exported Synra Cubism model before final
  commercial distribution if the sample model terms do not fit the release.
