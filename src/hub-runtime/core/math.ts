export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function actionEnvelope(progress: number, fadeIn = 0.12, fadeOut = 0.2): number {
  return smoothstep(0, fadeIn, progress) * (1 - smoothstep(1 - fadeOut, 1, progress));
}
