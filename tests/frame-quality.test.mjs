import assert from "node:assert/strict";
import test from "node:test";
import { aggregateFrameQuality, median, scorePixels } from "../src/client/frame-quality.js";

test("median resists a single extreme frame", () => assert.equal(median([1, 2, 100, 3, 4]), 3));

test("pixel scoring reports normalized objective metrics", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const result = scorePixels(pixels);
  assert.ok(result.brightness > 0.49 && result.brightness < 0.51);
  assert.ok(result.contrast > 0.9);
  assert.equal(result.motion, null);
});

test("aggregation rejects dark captures and excessive motion", () => {
  const result = aggregateFrameQuality([
    { brightness: 0.05, contrast: 0.1, sharpness: 0.1, motion: 0.2 },
    { brightness: 0.06, contrast: 0.1, sharpness: 0.1, motion: 0.2 }
  ]);
  assert.equal(result.lightingOk, false);
  assert.equal(result.stable, false);
  assert.equal(result.frameCount, 2);
});
