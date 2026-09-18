import { aggregateFacePoses, measureFacePose } from "./face-geometry.js";

const PACKAGE_VERSION = "1.0.1";
const PACKAGE_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + PACKAGE_VERSION;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
let instancePromise;

async function loadLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(PACKAGE_ROOT + "/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks(PACKAGE_ROOT + "/wasm");
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.65,
    minFacePresenceConfidence: 0.65,
    minTrackingConfidence: 0.65,
    outputFaceBlendshapes: true
  });
}

export function prepareFaceLandmarker() {
  instancePromise ||= loadLandmarker();
  return instancePromise;
}

export async function startFaceTracking(video, onResult, { intervalMs = 110 } = {}) {
  const landmarker = await prepareFaceLandmarker();
  let active = true;
  let lastRun = 0;
  async function loop(timestamp) {
    if (!active) return;
    if (video.readyState >= 2 && timestamp - lastRun >= intervalMs) {
      lastRun = timestamp;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks?.[0];
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      onResult(landmarks ? measureFacePose(landmarks, categories) : null);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { active = false; };
}

export async function sampleFaceLandmarks(video, { frameCount = 7, intervalMs = 90 } = {}) {
  const landmarker = await prepareFaceLandmarker();
  const poses = [];
  let bestLandmarks = null;
  for (let index = 0; index < frameCount; index += 1) {
    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (landmarks) {
      bestLandmarks = landmarks;
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      const pose = measureFacePose(landmarks, categories);
      if (pose) poses.push(pose);
    }
    if (index < frameCount - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return {
    faceCount: poses.length ? 1 : 0,
    successfulFrames: poses.length,
    pose: aggregateFacePoses(poses),
    landmarks: bestLandmarks?.map(({ x, y, z }) => ({ x, y, z })) || null,
    model: "mediapipe_face_landmarker",
    modelVersion: PACKAGE_VERSION
  };
}
