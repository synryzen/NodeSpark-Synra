# Synra Live2D Local Setup

This Mac is prepared for Synra Live2D production.

## Installed

```text
/Applications/Live2D Cubism 5.3/Live2D Cubism Editor 5.3.app
/Applications/Live2D Cubism 5.3/Live2D Cubism Viewer 5.3.app
```

The Synra browser runtime files are installed locally in:

```text
synra/web/assets/vendor/live2d/
```

The Jetson also has the browser runtime files installed and reports:

```text
runtimeReady: true
modelReady: false
```

## Open Tools

```bash
cd synra
bash scripts/open_live2d_editor_macos.sh
bash scripts/open_live2d_viewer_macos.sh
```

## Smoke Test

The official Live2D sample model can be installed with:

```bash
cd synra
bash scripts/install_live2d_smoke_test_model.sh
```

Open:

```text
http://127.0.0.1:8788/live2d-test.html?sample=1
```

On the Jetson:

```text
http://192.168.1.165:8788/live2d-test.html?sample=1
```

## Remaining Missing Asset

The final Synra character still needs the actual rigged runtime model:

```text
synra/web/assets/live2d/synra/synra.model3.json
```

That file must come from a Live2D Cubism export built from layered source art.
The flattened PNG reference cannot become a production Live2D rig by simply
installing software.
