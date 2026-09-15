import assert from "node:assert/strict";
import test from "node:test";
import { addWeightObservation, formatWeightDelta, loadWeightHistory, normalizeWeight } from "../src/client/weight.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("normalizes valid weight to one decimal place", () => assert.equal(normalizeWeight("174.24"), 174.2));

test("rejects implausible or nonnumeric weight", () => {
  for (const value of ["", 79, 501, "nope"]) assert.throws(() => normalizeWeight(value), /valid bodyweight/);
});

test("loads safely from missing or malformed storage", () => {
  assert.deepEqual(loadWeightHistory(memoryStorage()), []);
  assert.deepEqual(loadWeightHistory(memoryStorage({ "morning-call:weight-history:v1": "{" })), []);
});

test("adds newest observations first and formats change", () => {
  const storage = memoryStorage();
  addWeightObservation(173.8, "manual", storage, new Date("2026-09-14T12:00:00Z"));
  const { items } = addWeightObservation(174.2, "voice", storage, new Date("2026-09-15T12:00:00Z"));
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "voice");
  assert.equal(formatWeightDelta(items), "+0.4 lb from previous");
});

test("formats no-change and first-reading states", () => {
  assert.equal(formatWeightDelta([]), "No readings yet");
  assert.equal(formatWeightDelta([{ pounds: 174.2 }]), "First reading");
  assert.equal(formatWeightDelta([{ pounds: 174.2 }, { pounds: 174.2 }]), "No change");
});
