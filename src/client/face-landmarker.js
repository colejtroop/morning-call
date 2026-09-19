import { aggregateFacePoses, aggregateLandmarkFrames, calculateRegionStability, measureFacePose, smoothLandmarks } from "./face-geometry.js";

const PACKAGE_VERSION = "1.0.1";
const PACKAGE_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + PACKAGE_VERSION;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
let instancePromise;
let faceTopology = null;

async function loadLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(PACKAGE_ROOT + "/vision_bundle.mjs");
  faceTopology = {
    tesselation: FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    faceOval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    leftEye: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    rightEye: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    leftEyebrow: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    rightEyebrow: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    lips: FaceLandmarker.FACE_LANDMARKS_LIPS
  };
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

export async function startFaceTracking(video, onResult, { intervalMs = 105 } = {}) {
  const landmarker = await prepareFaceLandmarker();
  let active = true;
  let lastRun = 0;
  let smoothedLandmarks = null;
  async function loop(timestamp) {
    if (!active) return;
    if (video.readyState >= 2 && timestamp - lastRun >= intervalMs) {
      lastRun = timestamp;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks?.[0];
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      if (landmarks) {
        const stability = calculateRegionStability(smoothedLandmarks, landmarks);
        smoothedLandmarks = smoothLandmarks(smoothedLandmarks, landmarks);
        onResult({ pose: measureFacePose(smoothedLandmarks, categories), landmarks: smoothedLandmarks, stability, topology: faceTopology });
      } else onResult(null);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { active = false; };
}

export async function sampleFaceLandmarks(video, { frameCount = 7, intervalMs = 90 } = {}) {
  const landmarker = await prepareFaceLandmarker();
  const poses = [];
  const landmarkFrames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (landmarks) {
      landmarkFrames.push(landmarks);
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      const pose = measureFacePose(landmarks, categories);
      if (pose) poses.push(pose);
    }
    if (index < frameCount - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const aggregate = aggregateLandmarkFrames(landmarkFrames);
  return {
    faceCount: poses.length ? 1 : 0,
    successfulFrames: poses.length,
    pose: aggregateFacePoses(poses),
    landmarks: aggregate?.landmarks || null,
    landmarkUncertainty: aggregate?.uncertainty || null,
    model: "mediapipe_face_landmarker",
    modelVersion: PACKAGE_VERSION
  };
}
