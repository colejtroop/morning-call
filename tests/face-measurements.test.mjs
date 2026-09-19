import assert from "node:assert/strict";
import test from "node:test";
import { extractFaceMeasurements } from "../src/client/face-measurements.js";

test("extracts versioned ratios and carries measurement uncertainty", () => {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[234] = { x: 0.3, y: 0.5, z: 0 }; points[454] = { x: 0.7, y: 0.5, z: 0 };
  points[10] = { x: 0.5, y: 0.25, z: 0 }; points[152] = { x: 0.5, y: 0.75, z: 0 };
  points[33] = { x: 0.4, y: 0.42, z: 0 }; points[263] = { x: 0.6, y: 0.42, z: 0 };
  points[133] = { x: 0.46, y: 0.42, z: 0 }; points[362] = { x: 0.54, y: 0.42, z: 0 };
  points[61] = { x: 0.43, y: 0.62, z: 0 }; points[291] = { x: 0.57, y: 0.62, z: 0 };
  points[98] = { x: 0.46, y: 0.55, z: 0 }; points[327] = { x: 0.54, y: 0.55, z: 0 };
  points[159] = { x: 0.43, y: 0.4, z: 0 }; points[145] = { x: 0.43, y: 0.44, z: 0 };
  points[386] = { x: 0.57, y: 0.4, z: 0 }; points[374] = { x: 0.57, y: 0.44, z: 0 };
  points[172] = { x: 0.35, y: 0.68, z: 0 }; points[397] = { x: 0.65, y: 0.68, z: 0 };
  points[176] = { x: 0.44, y: 0.72, z: 0 }; points[400] = { x: 0.56, y: 0.72, z: 0 };
  points[105] = { x: 0.42, y: 0.34, z: 0 }; points[334] = { x: 0.58, y: 0.34, z: 0 };
  points[2] = { x: 0.5, y: 0.56, z: 0 };
  const result = extractFaceMeasurements(points, { medianLandmarkDeviation: 0.002, successfulFrames: 7 });
  assert.equal(result.schemaVersion, 1);
  assert.ok(Math.abs(result.values.faceWidthToHeight - 0.8) < 1e-9);
  assert.ok(result.values.interocularToFaceWidth > 0.49);
  assert.ok(Number.isFinite(result.values.meanCanthalTilt));
  assert.ok(result.values.jawToCheekWidth > 0.7);
  assert.ok(result.values.middleToLowerThird > 1);
  assert.match(result.unavailable.upperFacialThird, /Hairline/);
  assert.equal(result.uncertainty.sourceFrames, 7);
});

test("adds profile-only projection and angle measurements", () => {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[234] = { x: 0.3, y: 0.5, z: 0 }; points[454] = { x: 0.7, y: 0.5, z: 0 };
  points[10] = { x: 0.5, y: 0.2, z: 0 }; points[152] = { x: 0.54, y: 0.8, z: 0 };
  points[1] = { x: 0.62, y: 0.48, z: 0 }; points[2] = { x: 0.55, y: 0.55, z: 0 };
  points[168] = { x: 0.5, y: 0.36, z: 0 }; points[13] = { x: 0.58, y: 0.61, z: 0 }; points[14] = { x: 0.57, y: 0.64, z: 0 };
  points[172] = { x: 0.38, y: 0.7, z: 0 }; points[127] = { x: 0.36, y: 0.42, z: 0 };
  const result = extractFaceMeasurements(points, null, { view: "profile_left" });
  assert.equal(result.view, "profile_left");
  assert.ok(Number.isFinite(result.values.profileFacialConvexity));
  assert.ok(Number.isFinite(result.values.visualGonialAngle));
  assert.ok(Number.isFinite(result.values.upperLipELineOffset));
});
