import test from "node:test";
import assert from "node:assert/strict";
import {
  StationMicrophone,
  parseAlsaCaptureDevices,
  parsePulseAudioSources,
  preferredMicrophoneSource
} from "../dist/microphone.js";

test("parses pactl sources and prefers non-monitor input", () => {
  const sources = parsePulseAudioSources([
    "0\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED",
    "1\talsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING"
  ].join("\n"));

  assert.deepEqual(sources, [
    {
      id: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
      label: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
      present: true,
      configured: false,
      monitor: true
    },
    {
      id: "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo",
      label: "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo",
      present: true,
      configured: false,
      monitor: false
    }
  ]);
  assert.equal(preferredMicrophoneSource(sources)?.id, "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo");
});

test("parses arecord capture cards when pactl is unavailable", () => {
  const devices = parseAlsaCaptureDevices([
    "card 2: Nano [NVIDIA Jetson], device 0: tegra-hda HDMI 0 [tegra-hda HDMI 0]",
    "  Subdevices: 1/1",
    "card 3: Webcam [USB Webcam], device 0: USB Audio [USB Audio]",
    "  Subdevices: 1/1"
  ].join("\n"));

  assert.deepEqual(devices, [
    {
      id: "hw:2,0",
      label: "NVIDIA Jetson tegra-hda HDMI 0",
      present: true,
      configured: false,
      monitor: false
    },
    {
      id: "hw:3,0",
      label: "USB Webcam USB Audio",
      present: true,
      configured: false,
      monitor: false
    }
  ]);
});

test("reports ready when explicit configured source is detected", () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "alsa_input.usb-test.analog-stereo",
    discoverSources: () => [
      {
        id: "alsa_input.usb-test.analog-stereo",
        label: "USB Test Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "ready");
  assert.equal(status.configuredSource, "alsa_input.usb-test.analog-stereo");
  assert.equal(status.sources[0].configured, true);
});

test("reports not-configured when inputs exist but no source is configured", () => {
  const mic = new StationMicrophone(true, {
    discoverSources: () => [
      {
        id: "alsa_input.usb-test.analog-stereo",
        label: "USB Test Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "not-configured");
  assert.equal(status.configuredSource, null);
});

test("reports unavailable when no input sources are visible", () => {
  const mic = new StationMicrophone(true, { discoverSources: () => [] });
  const status = mic.debug();
  assert.equal(status.routeStatus, "unavailable");
});

test("reports unavailable when only monitor sources are visible", () => {
  const mic = new StationMicrophone(true, {
    discoverSources: () => [
      {
        id: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
        label: "System Monitor",
        present: true,
        configured: false,
        monitor: true
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "unavailable");
  assert.equal(status.sources.length, 1);
  assert.match(status.lastError || "", /monitor/i);
});

test("reports degraded when configured source is a monitor source", () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
    discoverSources: () => [
      {
        id: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
        label: "System Monitor",
        present: true,
        configured: false,
        monitor: true
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "degraded");
  assert.equal(status.sources[0].configured, true);
  assert.match(status.lastError || "", /monitor/i);
});

test("reports degraded when configured source is missing", () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "missing-source",
    discoverSources: () => [
      {
        id: "alsa_input.present.analog-stereo",
        label: "Present Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "degraded");
  assert.equal(status.configuredSource, "missing-source");
  assert.match(status.lastError || "", /missing-source/);
});

test("debug does not clear operational microphone errors", async () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "alsa_input.usb-test.analog-stereo",
    discoverSources: () => [
      {
        id: "alsa_input.usb-test.analog-stereo",
        label: "USB Test Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  await assert.rejects(() => mic.startListening(), /intentionally disabled/);
  const operationalError = mic.lastError;
  const status = mic.debug();

  assert.equal(status.routeStatus, "ready");
  assert.equal(status.lastError, operationalError);
  assert.equal(mic.lastError, operationalError);
});
