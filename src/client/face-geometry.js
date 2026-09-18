const point = (landmarks, index) => landmarks[index];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const radiansToDegrees = (value) => value * 180 / Math.PI;

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
