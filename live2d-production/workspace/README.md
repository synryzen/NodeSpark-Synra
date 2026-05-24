# Synra Live2D Workspace

This folder is intentionally separated from the web runtime.

- `source/` holds layered art such as `synra.psd`.
- `project/` holds Cubism editor files such as `synra.cmo3`.
- `runtime/` holds exported runtime files before they are installed into the app.
- `preview/` holds test screenshots and notes.

Run:

```bash
bash scripts/open_live2d_workspace_macos.sh
```

Then build/export in Cubism and install the exported runtime with:

```bash
bash scripts/install_live2d_model_pack.sh live2d-production/workspace/runtime
```
