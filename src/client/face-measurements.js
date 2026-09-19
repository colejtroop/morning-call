const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
const angleDegrees = (rise, run) => Math.atan2(rise, run) * 180 / Math.PI;
const angleAt = (a, vertex, c) => {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: c.x - vertex.x, y: c.y - vertex.y };
  const cosine = (first.x * second.x + first.y * second.y) / (Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
};
const signedLineDistance = (point, start, end) => {
  const denominator = Math.hypot(end.y - start.y, end.x - start.x);
  return denominator ? ((end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x) / denominator : null;
};

export function extractFaceMeasurements(landmarks, uncertainty = null, { view = "face_front", hairline = null } = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const faceWidth = distance(landmarks[234], landmarks[454]);
  const faceHeight = distance(landmarks[10], landmarks[152]);
  const interocular = distance(landmarks[33], landmarks[263]);
  const mouthWidth = distance(landmarks[61], landmarks[291]);
  const noseWidth = distance(landmarks[98], landmarks[327]);
  const leftEyeWidth = distance(landmarks[33], landmarks[133]);
  const rightEyeWidth = distance(landmarks[362], landmarks[263]);
  const leftEyeHeight = distance(landmarks[159], landmarks[145]);
  const rightEyeHeight = distance(landmarks[386], landmarks[374]);
  const intercanthal = distance(landmarks[133], landmarks[362]);
  const jawWidth = distance(landmarks[172], landmarks[397]);
  const chinWidth = distance(landmarks[176], landmarks[400]);
  const browY = (landmarks[105].y + landmarks[334].y) / 2;
  const noseBaseY = landmarks[2].y;
  const middleThirdProxy = noseBaseY - browY;
  const lowerThird = landmarks[152].y - noseBaseY;
  const leftCanthalTilt = angleDegrees(landmarks[133].y - landmarks[33].y, Math.abs(landmarks[133].x - landmarks[33].x));
  const rightCanthalTilt = angleDegrees(landmarks[362].y - landmarks[263].y, Math.abs(landmarks[263].x - landmarks[362].x));
  const leftOuterFifth = distance(landmarks[234], landmarks[33]);
  const rightOuterFifth = distance(landmarks[263], landmarks[454]);
  const leftBrowEyeDistance = distance(landmarks[105], landmarks[159]);
  const rightBrowEyeDistance = distance(landmarks[334], landmarks[386]);
  const leftIrisRadius = (distance(landmarks[468], landmarks[469]) + distance(landmarks[468], landmarks[471])) / 2;
  const rightIrisRadius = (distance(landmarks[473], landmarks[474]) + distance(landmarks[473], landmarks[476])) / 2;
  const leftScleralShow = ratio(landmarks[145].y - (landmarks[468].y + leftIrisRadius), leftEyeHeight);
  const rightScleralShow = ratio(landmarks[374].y - (landmarks[473].y + rightIrisRadius), rightEyeHeight);
  const centerX = (landmarks[10].x + landmarks[152].x) / 2;
  const symmetryPairs = [[33,263],[133,362],[61,291],[234,454]];
  const symmetryError = symmetryPairs.reduce((total, [left, right]) => {
    const leftDistance = Math.abs(landmarks[left].x - centerX);
    const rightDistance = Math.abs(landmarks[right].x - centerX);
    return total + Math.abs(leftDistance - rightDistance);
  }, 0) / symmetryPairs.length;
  const values = {
    faceWidth,
    faceHeight,
    interocularDistance: interocular,
    mouthWidth,
    noseWidth,
    faceWidthToHeight: ratio(faceWidth, faceHeight),
    interocularToFaceWidth: ratio(interocular, faceWidth),
    mouthToNoseWidth: ratio(mouthWidth, noseWidth),
    leftCanthalTilt,
    rightCanthalTilt,
    meanCanthalTilt: (leftCanthalTilt + rightCanthalTilt) / 2,
    canthalTiltDifference: Math.abs(leftCanthalTilt - rightCanthalTilt),
    leftEyeAspectRatio: ratio(leftEyeHeight, leftEyeWidth),
    rightEyeAspectRatio: ratio(rightEyeHeight, rightEyeWidth),
    eyeAspectRatioDifference: Math.abs(ratio(leftEyeHeight, leftEyeWidth) - ratio(rightEyeHeight, rightEyeWidth)),
    intercanthalToFaceWidth: ratio(intercanthal, faceWidth),
    leftEyeToFaceWidth: ratio(leftEyeWidth, faceWidth),
    rightEyeToFaceWidth: ratio(rightEyeWidth, faceWidth),
    leftOuterFifthToFaceWidth: ratio(leftOuterFifth, faceWidth),
    rightOuterFifthToFaceWidth: ratio(rightOuterFifth, faceWidth),
    jawToCheekWidth: ratio(jawWidth, faceWidth),
    chinToJawWidth: ratio(chinWidth, jawWidth),
    middleThirdProxy,
    lowerThird,
    middleToLowerThird: ratio(middleThirdProxy, lowerThird),
    bilateralEyeWidthDifference: Math.abs(leftEyeWidth - rightEyeWidth),
    symmetryError
  };
  Object.assign(values, {
    leftBrowEyeDistanceToEyeWidth: ratio(leftBrowEyeDistance, leftEyeWidth),
    rightBrowEyeDistanceToEyeWidth: ratio(rightBrowEyeDistance, rightEyeWidth),
    browEyeAsymmetry: Math.abs(ratio(leftBrowEyeDistance, leftEyeWidth) - ratio(rightBrowEyeDistance, rightEyeWidth)),
    leftLowerScleralShowProxy: leftScleralShow,
    rightLowerScleralShowProxy: rightScleralShow,
    scleralShowAsymmetry: Math.abs(leftScleralShow - rightScleralShow),
    leftPalpebralHeightToIris: ratio(leftEyeHeight, leftIrisRadius * 2),
    rightPalpebralHeightToIris: ratio(rightEyeHeight, rightIrisRadius * 2)
  });
  if (hairline?.y < browY) {
    const upperThird = browY - hairline.y;
    Object.assign(values, {
      upperThird,
      upperToMiddleThird: ratio(upperThird, middleThirdProxy),
      upperToLowerThird: ratio(upperThird, lowerThird)
    });
  }
  if (view.startsWith("profile_")) {
    const direction = view === "profile_left" ? 1 : -1;
    const noseTip = landmarks[1];
    const noseBase = landmarks[2];
    const chin = landmarks[152];
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const gonion = view === "profile_left" ? landmarks[172] : landmarks[397];
    const earSide = view === "profile_left" ? landmarks[127] : landmarks[356];
    Object.assign(values, {
      profileFacialConvexity: angleAt(landmarks[168], noseBase, chin),
      nasalProjectionToFaceHeight: ratio(Math.abs(noseTip.x - noseBase.x), faceHeight),
      chinProjectionToFaceHeight: direction * ratio(chin.x - noseBase.x, faceHeight),
      upperLipELineOffset: direction * signedLineDistance(upperLip, noseTip, chin),
      lowerLipELineOffset: direction * signedLineDistance(lowerLip, noseTip, chin),
      visualGonialAngle: angleAt(earSide, gonion, chin)
    });
  }
  return {
    schemaVersion: 1,
    coordinateSpace: "normalized_3d",
    view,
    values,
    unavailable: hairline ? {} : {
      upperFacialThird: "Hairline landmark has not been manually calibrated.",
      completeFacialThirds: "Upper third requires a confirmed hairline reference."
    },
    uncertainty: {
      medianLandmarkDeviation: uncertainty?.medianLandmarkDeviation ?? null,
      sourceFrames: uncertainty?.successfulFrames ?? null
    }
  };
}
