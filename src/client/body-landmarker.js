import { measureBodyPose } from "./body-geometry.js";

const PACKAGE_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
let instancePromise;

async function loadLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import(PACKAGE_ROOT + "/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks(PACKAGE_ROOT + "/wasm");
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
}

export function prepareBodyLandmarker() { instancePromise ||= loadLandmarker(); return instancePromise; }

export async function startBodyTracking(video, onResult, { intervalMs = 105 } = {}) {
  const landmarker = await prepareBodyLandmarker();
  let active = true;
  let lastRun = 0;
  function loop(timestamp) {
    if (!active) return;
    if (video.readyState >= 2 && timestamp - lastRun >= intervalMs) {
      lastRun = timestamp;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks?.[0] || null;
      onResult(landmarks ? { landmarks, measurements: measureBodyPose(landmarks) } : null);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { active = false; };
}
