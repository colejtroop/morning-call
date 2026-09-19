import assert from "node:assert/strict";
import test from "node:test";
import { measureBodyPose, validateBodyPose } from "../src/client/body-geometry.js";

function body() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[0] = { x: 0.5, y: 0.08, visibility: 1 };
  points[11] = { x: 0.4, y: 0.25, visibility: 1 }; points[12] = { x: 0.6, y: 0.25, visibility: 1 };
  points[23] = { x: 0.44, y: 0.52, visibility: 1 }; points[24] = { x: 0.56, y: 0.52, visibility: 1 };
  points[27] = { x: 0.45, y: 0.86, visibility: 1 }; points[28] = { x: 0.55, y: 0.86, visibility: 1 };
  return points;
}

test("accepts a centered full-body step-back pose", () => assert.equal(validateBodyPose(measureBodyPose(body())).ok, true));
test("requires visible ankles", () => { const points = body(); points[28].visibility = 0.1; assert.match(validateBodyPose(measureBodyPose(points)).reason, /ankles/); });
