# Jetson Findings

Last checked: June 20, 2026.

## Runtime

- `synra-standalone.service` is active.
- `synra-electron-kiosk.service` is active.
- Python server memory is low, around 25 MB in the latest service check.
- `/api/health` reports route-specific model labels for conversation, vision, tools, and NodeSpark.
- Kiosk telemetry is available at `/api/telemetry/public`.
- Synra Standalone reports version `4.4.0`.
- The Jetson Station shell on the device reported version `4.3.0`, while the local station package is `4.4.0`; redeploy station assets so the shell and app version match.

## Camera

- The Jetson currently exposes `/dev/media0`, `/dev/media1`, `/dev/video0`, and `/dev/video1`.
- `/api/health` reports two video devices and two media devices.
- `/api/vision/public` still has an empty configured camera device and remains diagnostic-only.
- Real identity enrollment needs a visible, permissioned capture path that selects `/dev/video0` or `/dev/video1` and reports configured-device readiness.

## Audio

- PulseAudio/PipeWire reports an analog input source.
- ALSA reports NVIDIA Jetson Orin Nano APE capture devices.
- Kiosk wake listening is active, but live checks have reported ElevenLabs speech-to-text HTTP failures, first HTTP 500 and then HTTP 401 after deployment.
- Synra Standalone now has a server transcription circuit breaker and browser speech fallback so a remote STT outage or invalid server-managed STT credential does not keep retrying silently.
- A physical kiosk microphone retest is still needed from the Jetson display/browser permission prompt after deployment.

## Kiosk Display

- The active graphical session is X11. On the tested Jetson it has appeared as `DISPLAY=:0` after reboot; detect the active socket instead of hard-coding `:1`.
- Launching kiosk from SSH requires:

```bash
export DISPLAY="${DISPLAY:-:0}"
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
- `SYNRA_KIOSK_ANGLE_BACKEND=vulkan` with `Vulkan`, `DefaultANGLEVulkan`, `VulkanFromANGLE`, `--enable-webgl`, and `--enable-webgl2`: WebGL reports available in snap Chromium.

Observed Vulkan errors before the full Vulkan-from-ANGLE flag set:

```text
No suitable EGL configs found for initialization.
ContextResult::kFatalFailure: ES3 is blocklisted/disabled/unsupported by driver.
```

Observed after the full Vulkan-from-ANGLE flag set:

- WebGL became available.
- Synra rendered again in kiosk mode.
- The latest kiosk health check reported `renderQuality: sharp` and about 30 FPS.
- GPU telemetry did not show the level of `GR3D_FREQ` activity expected from a healthy hardware-rendered kiosk.
- Render-scale tests at `0.62`, `0.42`, `0.35`, and `0.28` stayed around 6-7 FPS and made Synra visibly blurred/pixelated, so lowering render scale is rejected as a primary performance fix.

## Identity Readiness

- The saved known user had recognition enabled but zero face samples and zero voiceprints.
- Synra 4.5 now reports identity readiness as metadata so "recognition on" no longer hides missing enrollment data.
- Face readiness requires seven pose samples: center, turn left, turn right, look up, look down, roll left, and roll right.
- Voice readiness requires three voice samples.

## Recommendation

The app now fails gracefully when WebGL is unavailable, and the kiosk launcher has a repeatable Vulkan-from-ANGLE path that can make WebGL available. Full Synra avatar rendering on this Jetson still requires improving the browser/GPU stack or using a lighter dedicated runtime. The likely next hardware/runtime work is:

1. Install or test a non-snap Chromium/Electron/runtime build with working WebGL2 on Jetson.
2. Confirm NVIDIA userspace graphics packages and EGL/Vulkan support.
3. Confirm WebGL2 in the browser before expecting Three.js VRM rendering.
4. Redeploy the 4.4.0 Jetson Station shell and verify `/api/kiosk/health`.
5. Configure the active camera device and rerun `/api/vision/public`.
6. Retest wake/listen after correcting the ElevenLabs STT credential or installing a local STT backend; until then the new telemetry should report degraded server transcription instead of a healthy wake path.
