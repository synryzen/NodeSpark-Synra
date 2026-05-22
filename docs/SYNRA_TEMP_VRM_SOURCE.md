# Temporary Synra VRM Source

The current `web/assets/avatars/synra.vrm` is a temporary VRoid sample model
used to exercise the real-time VRM runtime.

Source:

```text
https://github.com/madjin/vrm-samples
vroid/beta/Sendagaya_Shino.vrm
```

The sample repository points to VRoid Studio sample-model terms and identifies
the beta sample models as CC0. This makes the model appropriate as a temporary
editable base while the production Synra model is created.

The previous placeholder is kept locally at:

```text
web/assets/avatars/synra.previous.vrm
```

Additional preview candidates are stored in:

```text
web/assets/avatars/candidates/
```

Preview a candidate without replacing the active model:

```text
http://localhost:8788/?vrm=/assets/avatars/candidates/AvatarSample_B.vrm
```

This file should be replaced once a custom Synra VRM matching the reference art
is exported.
