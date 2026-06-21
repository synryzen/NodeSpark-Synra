export interface FaceFrameQuality {
  accepted: boolean;
  score: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  message: string;
}

export interface EnrollmentMicrophoneSignal {
  levelScore: number;
  voiceIsolationScore: number;
  backgroundNoiseScore: number;
}

export interface VoiceEnrollmentQuality {
  accepted: boolean;
  score: number;
  level: number;
  isolation: number;
  noise: number;
  voiceprint: number;
  message: string;
}

export function evaluateFaceFrameQuality(imageData: ImageData): FaceFrameQuality {
  const data = imageData.data;
  const width = imageData.width;
  const stride = 4;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let count = 0;
  let previousRowLuminance = new Float32Array(width);

  for (let index = 0; index < data.length; index += stride) {
    const pixel = index / stride;
    const x = pixel % width;
    const luminance = ((0.2126 * data[index]) + (0.7152 * data[index + 1]) + (0.0722 * data[index + 2])) / 255;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    count += 1;
    if (x > 0) {
      const leftIndex = index - stride;
      const left = ((0.2126 * data[leftIndex]) + (0.7152 * data[leftIndex + 1]) + (0.0722 * data[leftIndex + 2])) / 255;
      edgeSum += Math.abs(luminance - left);
      edgeCount += 1;
    }
    if (pixel >= width) {
      edgeSum += Math.abs(luminance - previousRowLuminance[x]);
      edgeCount += 1;
    }
    previousRowLuminance[x] = luminance;
  }

  const brightness = count ? luminanceSum / count : 0;
  const variance = count ? Math.max(0, (luminanceSquaredSum / count) - (brightness * brightness)) : 0;
  const contrast = Math.sqrt(variance);
  const sharpness = edgeCount ? edgeSum / edgeCount : 0;
  const brightnessScore = brightness < 0.18 ? brightness / 0.18 : brightness > 0.88 ? (1 - brightness) / 0.12 : 1;
  const contrastScore = Math.min(1, contrast / 0.085);
  const sharpnessScore = Math.min(1, sharpness / 0.027);
  const score = clampUnit((brightnessScore * 0.34) + (contrastScore * 0.32) + (sharpnessScore * 0.34));
  const accepted = score >= 0.62 && brightness >= 0.16 && brightness <= 0.92 && contrast >= 0.045 && sharpness >= 0.012;
  let message = "Frame quality accepted.";
  if (brightness < 0.16) message = "Add more light so Synra can see your face clearly.";
  else if (brightness > 0.92) message = "Reduce glare or step back from the bright light.";
  else if (contrast < 0.045) message = "Move closer and keep your face separated from the background.";
  else if (sharpness < 0.012) message = "Hold still for a sharper face sample.";
  else if (!accepted) message = "Center your face in the ring and try again.";
  return { accepted, score, brightness, contrast, sharpness, message };
}

export function evaluateVoiceEnrollmentQuality(input: {
  peakRms: number;
  signal?: EnrollmentMicrophoneSignal;
  voicePrintQuality?: number;
}): VoiceEnrollmentQuality {
  const level = input.signal?.levelScore ?? Math.min(1, input.peakRms * 32);
  const isolation = input.signal?.voiceIsolationScore ?? level;
  const noise = input.signal?.backgroundNoiseScore ?? 0.65;
  const voiceprint = input.voicePrintQuality ?? 0;
  const score = clampUnit((level * 0.3) + (isolation * 0.25) + (noise * 0.2) + (voiceprint * 0.25));
  const accepted = input.peakRms >= 0.003 && level >= 0.08 && isolation >= 0.2 && noise >= 0.22 && voiceprint >= 0.18 && score >= 0.38;
  let message = "Voice sample accepted.";
  if (input.peakRms < 0.003 || level < 0.08) message = "That was too quiet. Move closer and speak naturally.";
  else if (isolation < 0.2) message = "Synra needs a cleaner voice signal. Reduce nearby sound and try again.";
  else if (noise < 0.22) message = "Background noise is too high for a reliable voiceprint.";
  else if (voiceprint < 0.18) message = "That sample was not distinct enough. Repeat the phrase clearly.";
  else if (!accepted) message = "Try again with a steady voice and a quieter room.";
  return { accepted, score, level, isolation, noise, voiceprint, message };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
