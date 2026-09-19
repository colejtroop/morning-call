import assert from "node:assert/strict";
import test from "node:test";
import { aggregateFacePoses, aggregateLandmarkFrames, applyPoseCalibration, calculateRegionStability, measureFacePose, smoothLandmarks, validateCalibrationPose, validateFacePose } from "../src/client/face-geometry.js";

function face({ noseX = 0.5, eyeTilt = 0 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[234] = { x: 0.3, y: 0.5, z: 0 };
  points[454] = { x: 0.7, y: 0.5, z: 0 };
  points[1] = { x: noseX, y: 0.5, z: -0.05 };
  points[33] = { x: 0.4, y: 0.42, z: 0 };
  points[263] = { x: 0.6, y: 0.42 + eyeTilt, z: 0 };
  points[10] = { x: 0.5, y: 0.28, z: 0 };
  points[152] = { x: 0.5, y: 0.72, z: 0 };
  return points;
}

test("measures centered frontal face and approves front position", () => {
  const pose = measureFacePose(face());
  assert.ok(Math.abs(pose.yaw) < 0.01);
  assert.equal(validateFacePose("face_front", pose).ok, true);
});

test("requires the requested yaw direction", () => {
  const left = measureFacePose(face({ noseX: 0.58 }));
  assert.equal(validateFacePose("face_left", left).ok, true);
  assert.equal(validateFacePose("face_right", left).ok, false);
});

test("rejects blink and aggregates pose robustly", () => {
  const blink = measureFacePose(face(), [{ categoryName: "eyeBlinkLeft", score: 0.9 }]);
  assert.match(validateFacePose("face_front", blink).reason, /Open your eyes/);
  assert.equal(aggregateFacePoses([{ yaw: 1 }, { yaw: 2 }, { yaw: 90 }]).yaw, 2);
});

test("calibration makes the captured upright pose the personal zero", () => {
  const raw = measureFacePose(face({ noseX: 0.52, eyeTilt: -0.02 }));
  assert.equal(validateCalibrationPose(raw).ok, true);
  const adjusted = applyPoseCalibration(raw, raw);
  assert.equal(adjusted.yaw, 0);
  assert.equal(adjusted.pitch, 0);
  assert.equal(adjusted.roll, 0);
});

test("aggregates landmarks across frames and reports uncertainty", () => {
  const result = aggregateLandmarkFrames([
    [{ x: 0.4, y: 0.5, z: 0 }], [{ x: 0.41, y: 0.49, z: 0.01 }], [{ x: 0.9, y: 0.9, z: 0.3 }]
  ]);
  assert.equal(result.landmarks[0].x, 0.41);
  assert.equal(result.landmarks[0].y, 0.5);
  assert.equal(result.uncertainty.successfulFrames, 3);
  assert.ok(result.uncertainty.medianLandmarkDeviation < 0.02);
});

test("smooths live landmarks and reports anatomical-region stability", () => {
  const previous = face();
  const current = face({ noseX: 0.52 });
  const smoothed = smoothLandmarks(previous, current, 0.5);
  assert.equal(smoothed[1].x, 0.51);
  const stability = calculateRegionStability(previous, current);
  assert.ok(Number.isFinite(stability.eyes));
  assert.ok(Number.isFinite(stability.jaw));
});
