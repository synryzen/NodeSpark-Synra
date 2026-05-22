# Delivery Structure

Ask the artist/rigger to deliver the finished package in this shape:

```text
nodespark-synra-live2d-delivery/
  source/
    synra.psd
    synra.cmo3
    notes.md
  runtime/
    synra.model3.json
    synra.moc3
    textures/
      texture_00.png
      texture_01.png
    motions/
      idle.motion3.json
      listen.motion3.json
      think.motion3.json
      talk.motion3.json
      success.motion3.json
      concerned.motion3.json
      approval.motion3.json
    expressions/
      neutral.exp3.json
      happy.exp3.json
      attentive.exp3.json
      focused.exp3.json
      curious.exp3.json
      concerned.exp3.json
      wink.exp3.json
    physics3.json
    pose3.json
```

To install the runtime pack into the app:

```bash
cd synra
bash scripts/install_live2d_model_pack.sh /path/to/nodespark-synra-live2d-delivery
```

When the check passes, refresh the Jetson monitor page. The browser UI will
load the Live2D model and hide the fallback image.
