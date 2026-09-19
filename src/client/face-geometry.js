const point = (landmarks, index) => landmarks[index];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const radiansToDegrees = (value) => value * 180 / Math.PI;
const LANDMARK_REGIONS = {
  eyes: [33,133,159,145,263,362,386,374],
  nose: [1,2,98,327],
  mouth: [0,17,61,291],
  jaw: [10,152,172,234,397,454]
};

export function measureFacePose(landmarks, blendshapes = []) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const leftEdge = point(landmarks, 234);
  const rightEdge = point(landmarks, 454);
  const nose = point(landmarks, 1);
  const leftEye = point(landmarks, 33);
  const rightEye = point(landmarks, 263);
  const forehead = point(landmarks, 10);
  const chin = point(landmarks, 152);
  const minX = Math.min(...landmarks.map(({ x }) => x));
  const maxX = Math.max(...landmarks.map(({ x }) => x));
  const minY = Math.min(...landmarks.map(({ y }) => y));
  const maxY = Math.max(...landmarks.map(({ y }) => y));
  const faceWidth = distance(leftEdge, rightEdge);
  const horizontal = Math.max(0.001, rightEdge.x - leftEdge.x);
  const yawRatio = ((nose.x - leftEdge.x) / horizontal) - 0.5;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const vertical = Math.max(0.001, chin.y - forehead.y);
  const pitchRatio = ((nose.y - eyeMidY) / vertical) - 0.17;
  const scores = Object.fromEntries(blendshapes.map(({ categoryName, score }) => [categoryName, score]));
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    yaw: yawRatio * 100,
    pitch: pitchRatio * 100,
    roll: radiansToDegrees(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)),
    eyeBlinkLeft: scores.eyeBlinkLeft ?? null,
    eyeBlinkRight: scores.eyeBlinkRight ?? null,
    interEdgeWidth: faceWidth,
    leftEyeX: leftEye.x,
    leftEyeY: leftEye.y,
    rightEyeX: rightEye.x,
    rightEyeY: rightEye.y
  };
}

export function applyPoseCalibration(pose, calibration) {
  if (!pose || !calibration) return pose;
  return { ...pose, yaw: pose.yaw - calibration.yaw, pitch: pose.pitch - calibration.pitch, roll: pose.roll - calibration.roll };
}

export function validateCalibrationPose(pose) {
  if (!pose) return { ok: false, reason: "No face detected." };
  const eyeMidX = (pose.leftEyeX + pose.rightEyeX) / 2;
  const eyeMidY = (pose.leftEyeY + pose.rightEyeY) / 2;
  if (Math.abs(eyeMidX - 0.5) > 0.1 || Math.abs(eyeMidY - 0.43) > 0.12) return { ok: false, reason: "Put your eyes in the guides." };
  if (pose.width < 0.22) return { ok: false, reason: "Move closer." };
  if (pose.width > 0.7) return { ok: false, reason: "Move back." };
  if ((pose.eyeBlinkLeft ?? 0) > 0.55 || (pose.eyeBlinkRight ?? 0) > 0.55) return { ok: false, reason: "Open your eyes and look straight ahead." };
  return { ok: true, reason: "Hold neutral…" };
}

export function validateFacePose(position, pose) {
  if (!pose) return { ok: false, reason: "No face detected." };
  if (Math.abs(pose.centerX - 0.5) > 0.13 || Math.abs(pose.centerY - 0.48) > 0.18) return { ok: false, reason: "Center your face in the guide." };
  if (pose.width < 0.22) return { ok: false, reason: "Move closer." };
  if (pose.width > 0.72) return { ok: false, reason: "Move back." };
  if (Math.abs(pose.roll) > 7) return { ok: false, reason: "Keep your head level." };
  if ((pose.eyeBlinkLeft ?? 0) > 0.55 || (pose.eyeBlinkRight ?? 0) > 0.55) return { ok: false, reason: "Open your eyes and hold." };
  if (position === "face_front" && Math.abs(pose.yaw) > 10) return { ok: false, reason: "Face forward." };
  if (position === "face_left" && (pose.yaw < 14 || pose.yaw > 42)) return { ok: false, reason: pose.yaw < 14 ? "Turn a little farther left." : "Turn slightly back toward center." };
  if (position === "face_right" && (pose.yaw > -14 || pose.yaw < -42)) return { ok: false, reason: pose.yaw > -14 ? "Turn a little farther right." : "Turn slightly back toward center." };
  if (position === "profile_left" && (pose.yaw < 45 || pose.yaw > 78)) return { ok: false, reason: pose.yaw < 45 ? "Keep turning left toward profile." : "Turn slightly back toward camera." };
  if (position === "profile_right" && (pose.yaw > -45 || pose.yaw < -78)) return { ok: false, reason: pose.yaw > -45 ? "Keep turning right toward profile." : "Turn slightly back toward camera." };
  return { ok: true, reason: "Hold still." };
}

export function aggregateFacePoses(poses) {
  if (!poses.length) return null;
  const median = (field) => {
    const values = poses.map((pose) => pose[field]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  return Object.fromEntries(["centerX", "centerY", "width", "height", "yaw", "pitch", "roll", "eyeBlinkLeft", "eyeBlinkRight", "interEdgeWidth", "leftEyeX", "leftEyeY", "rightEyeX", "rightEyeY"].map((field) => [field, median(field)]));
}

export function aggregateLandmarkFrames(frames) {
  if (!frames.length) return null;
  const count = Math.min(...frames.map((frame) => frame.length));
  const landmarks = [];
  const deviations = [];
  const middle = (values) => {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
  };
  for (let index = 0; index < count; index += 1) {
    const x = middle(frames.map((frame) => frame[index].x));
    const y = middle(frames.map((frame) => frame[index].y));
    const z = middle(frames.map((frame) => frame[index].z));
    landmarks.push({ x, y, z });
    deviations.push(middle(frames.map((frame) => Math.hypot(frame[index].x - x, frame[index].y - y))));
  }
  const regions = Object.fromEntries(Object.entries(LANDMARK_REGIONS).map(([name, indexes]) => [
    name,
    middle(indexes.filter((index) => index < deviations.length).map((index) => deviations[index]))
  ]));
  return { landmarks, uncertainty: { medianLandmarkDeviation: middle(deviations), regions, successfulFrames: frames.length } };
}

export function smoothLandmarks(previous, current, alpha = 0.42) {
  if (!previous || previous.length !== current?.length) return current?.map((point) => ({ ...point })) || null;
  return current.map((point, index) => ({
    x: previous[index].x + (point.x - previous[index].x) * alpha,
    y: previous[index].y + (point.y - previous[index].y) * alpha,
    z: previous[index].z + (point.z - previous[index].z) * alpha
  }));
}

export function calculateRegionStability(previous, current) {
  if (!previous || !current || previous.length !== current.length) return null;
  const values = {};
  for (const [name, indexes] of Object.entries(LANDMARK_REGIONS)) {
    const movement = indexes.map((index) => Math.hypot(current[index].x - previous[index].x, current[index].y - previous[index].y));
    values[name] = medianValue(movement);
  }
  return values;
}

function medianValue(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
