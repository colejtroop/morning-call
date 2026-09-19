const REQUIRED = [0, 11, 12, 23, 24, 27, 28];

export function measureBodyPose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 33) return null;
  const visible = REQUIRED.every((index) => (landmarks[index].visibility ?? 1) >= 0.55);
  const xs = REQUIRED.map((index) => landmarks[index].x);
  const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
  const hipY = (landmarks[23].y + landmarks[24].y) / 2;
  const ankleY = (landmarks[27].y + landmarks[28].y) / 2;
  const shoulderTilt = Math.atan2(landmarks[12].y - landmarks[11].y, landmarks[12].x - landmarks[11].x) * 180 / Math.PI;
  return {
    visible,
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    bodyHeight: ankleY - landmarks[0].y,
    torsoHeight: hipY - shoulderY,
    shoulderTilt,
    shoulderWidth: Math.hypot(landmarks[12].x - landmarks[11].x, landmarks[12].y - landmarks[11].y)
  };
}

export function validateBodyPose(body) {
  if (!body) return { ok: false, reason: "No body detected." };
  if (!body.visible) return { ok: false, reason: "Step back until your head, hips, and ankles are visible." };
  if (Math.abs(body.centerX - 0.5) > 0.14) return { ok: false, reason: "Center your body." };
  if (body.bodyHeight < 0.58) return { ok: false, reason: "Move closer." };
  if (body.bodyHeight > 0.94) return { ok: false, reason: "Step back." };
  if (Math.abs(body.shoulderTilt) > 8) return { ok: false, reason: "Stand level and relax your shoulders." };
  return { ok: true, reason: "Hold still…" };
}
