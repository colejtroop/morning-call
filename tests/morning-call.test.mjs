import assert from "node:assert/strict";
import test from "node:test";
import { addConversationObservations, advanceMorningCall, buildSummary, createMorningCall, currentStep, recordSessionWeight } from "../src/client/morning-call.js";

test("morning flow requires weight and visits every capture position", () => {
  let session = createMorningCall(new Date("2026-09-18T12:00:00Z"));
  assert.equal(currentStep(session).id, "weight");
  assert.throws(() => advanceMorningCall(session), /Record weight/);
  session = recordSessionWeight(session, { pounds: 174.2, source: "demo_voice" });
  session = advanceMorningCall(session);
  assert.equal(currentStep(session).id, "face_calibrate");
  session = advanceMorningCall(session);
  for (const position of ["face_front", "face_left", "face_right", "body_front"]) {
    assert.equal(currentStep(session).id, position);
    session = advanceMorningCall(session, { quality: 1, observer: "demo" });
  }
  assert.equal(currentStep(session).id, "complete");
  assert.equal(session.captures.length, 4);
  assert.ok(session.completedAt);
});

test("extracts conservative conversational context", () => {
  let session = addConversationObservations(createMorningCall(), "My left shoulder is pretty sore and I slept badly.");
  assert.deepEqual(session.observations.map((item) => item.type), ["shoulder_soreness", "poor_sleep"]);
  assert.match(buildSummary(recordSessionWeight(session, { pounds: 170, source: "manual" })), /Shoulder soreness is noted/);
});
