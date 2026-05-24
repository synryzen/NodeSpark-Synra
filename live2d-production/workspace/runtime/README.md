# Runtime Export

Export the Cubism runtime model here before installing it into the app.

Required entry file:

```text
synra.model3.json
```

Expected shape:

```text
synra.model3.json
synra.moc3
textures/
motions/
expressions/
physics3.json
pose3.json
```

Install after export:

```bash
bash scripts/install_live2d_model_pack.sh live2d-production/workspace/runtime
```
