import assert from "node:assert/strict";
import test from "node:test";
import { buildCaptureConditionModel, buildPersonalErrorModel, compareToPersonalBaseline, validateCaptureConditions } from "../src/client/measurement-model.js";

const session = (value) => ({ captures: [{ position: "face_front", face: { measurements: { values: { faceWidthToHeight: value } } } }] });

test("requires enough confirmed samples before enabling comparison", () => {
  const model = buildPersonalErrorModel([session(0.8), session(0.801)]);
  assert.equal(model.ready, false);
  assert.equal(model.metrics.faceWidthToHeight.reliability, "insufficient");
  assert.equal(compareToPersonalBaseline(0.82, model.metrics.faceWidthToHeight).status, "insufficient_data");
});

test("learns robust personal noise and ignores an isolated outlier", () => {
  const model = buildPersonalErrorModel([0.8, 0.801, 0.799, 0.8, 0.9].map(session));
  const metric = model.metrics.faceWidthToHeight;
  assert.equal(metric.ready, true);
  assert.ok(Math.abs(metric.baseline - 0.8) < 1e-9);
  assert.ok(metric.robustSigma < 0.003);
  assert.equal(compareToPersonalBaseline(0.8005, metric).status, "within_noise");
  assert.equal(compareToPersonalBaseline(0.82, metric).status, "increased");
});

test("learns repeatable camera distance and rejects mismatched scale", () => {
  const sessions = [0.4,0.401,0.399,0.4,0.402].map((width) => ({ captures: [{ position: "face_front", face: { pose: { width } } }] }));
  const model = buildCaptureConditionModel(sessions);
  assert.equal(model.ready, true);
  assert.equal(validateCaptureConditions(0.405, model).ok, true);
  assert.equal(validateCaptureConditions(0.5, model).status, "too_close");
});
