# Synra Live2D Runtime Slot

This is where the app loads the final Live2D runtime model.

Required file:

```text
synra.model3.json
```

Install a finished Cubism export with:

```bash
bash scripts/install_live2d_model_pack.sh /path/to/runtime-or-delivery-folder
```

The app will use the temporary VRM fallback until this runtime slot contains a
valid Synra model.
