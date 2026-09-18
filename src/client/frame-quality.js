export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function scorePixels(rgba, previousLuma = null) {
  const luma = new Float32Array(rgba.length / 4);
  let sum = 0;
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    const value = rgba[source] * 0.2126 + rgba[source + 1] * 0.7152 + rgba[source + 2] * 0.0722;
    luma[target] = value;
    sum += value;
  }
  const brightness = sum / luma.length;
  let variance = 0;
  let edge = 0;
  let motion = 0;
  for (let index = 0; index < luma.length; index += 1) {
    variance += (luma[index] - brightness) ** 2;
    if (index > 0) edge += Math.abs(luma[index] - luma[index - 1]);
    if (previousLuma?.length === luma.length) motion += Math.abs(luma[index] - previousLuma[index]);
  }
  return {
    luma,
    brightness: brightness / 255,
    contrast: Math.sqrt(variance / luma.length) / 128,
    sharpness: edge / (luma.length - 1) / 255,
    motion: previousLuma?.length === luma.length ? motion / luma.length / 255 : null
  };
}

export function aggregateFrameQuality(frames) {
  const fields = ["brightness", "contrast", "sharpness", "motion"];
  const metrics = Object.fromEntries(fields.map((field) => [field, median(frames.map((frame) => frame[field]).filter(Number.isFinite))]));
  const lightingOk = metrics.brightness >= 0.18 && metrics.brightness <= 0.88 && metrics.contrast >= 0.08;
  const stable = metrics.motion === null || metrics.motion <= 0.08;
  return { ...metrics, lightingOk, stable, frameCount: frames.length, qualityVersion: 1 };
}
