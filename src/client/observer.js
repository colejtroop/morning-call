import { aggregateFrameQuality, scorePixels } from "./frame-quality.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function sampleCaptureQuality(video, { frameCount = 12, intervalMs = 80 } = {}) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("Camera is not ready.");
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = Math.max(90, Math.round(160 * video.videoHeight / video.videoWidth));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const frames = [];
  let previous = null;
  for (let index = 0; index < frameCount; index += 1) {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const scored = scorePixels(context.getImageData(0, 0, canvas.width, canvas.height).data, previous);
    previous = scored.luma;
    frames.push(scored);
    if (index < frameCount - 1) await wait(intervalMs);
  }
  return aggregateFrameQuality(frames);
}
