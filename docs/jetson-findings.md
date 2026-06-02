# Jetson Findings

Last checked: June 2, 2026.

## Runtime

- `synra-standalone.service` is active.
- Python server memory is low, around 11 MB in the latest service check.
- `/api/health` reports route-specific model labels for conversation, vision, tools, and NodeSpark.
- Kiosk telemetry is available at `/api/telemetry/public`.

## Camera

- The Jetson currently exposes `/dev/media0`.
- No `/dev/video*` stream device is present.
- Synra correctly reports this as a media controller without a video stream.
- Real vision needs a camera driver/device fix before a vision model route can do useful work.

## Audio

- PulseAudio/PipeWire reports an analog input source.
- ALSA reports NVIDIA Jetson Orin Nano APE capture devices.
- A physical kiosk microphone test is still needed from the Jetson display/browser permission prompt.

## Kiosk Display

- The active graphical session is X11 on `DISPLAY=:1`.
- Launching kiosk from SSH requires:

```bash
export DISPLAY=:1
export XAUTHORITY=/run/user/1000/gdm/Xauthority
export XDG_RUNTIME_DIR=/run/user/1000
```

## WebGL/GPU

Default snap Chromium launches but WebGL is unavailable in Synra telemetry.

Observed default errors:

```text
EGL_NOT_INITIALIZED
GLDisplayEGL::Initialize failed
Exiting GPU process due to errors during initialization
```

Tested overrides:

- `SYNRA_KIOSK_GL_MODE=desktop`: not allowed by snap Chromium.
- `SYNRA_KIOSK_GL_MODE=egl`: not allowed by snap Chromium.
- `SYNRA_KIOSK_GL_MODE=swiftshader`: not allowed by snap Chromium.
- `SYNRA_KIOSK_ANGLE_BACKEND=vulkan`: starts a GPU process, but WebGL still reports unavailable.

Observed Vulkan errors:

```text
No suitable EGL configs found for initialization.
ContextResult::kFatalFailure: ES3 is blocklisted/disabled/unsupported by driver.
```

## Recommendation

The app now fails gracefully and reports `webgl: unavailable`, but full Synra avatar rendering on this Jetson requires fixing the browser/GPU stack. The likely next hardware/runtime work is:

1. Install or test a non-snap Chromium/Chrome build with working WebGL2 on Jetson.
2. Confirm NVIDIA userspace graphics packages and EGL/Vulkan support.
3. Confirm WebGL2 in the browser before expecting Three.js VRM rendering.
4. Once WebGL reports available, rerun `kiosk-performance-check.sh` and watch `GR3D_FREQ`.
