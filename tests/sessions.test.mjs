import assert from "node:assert/strict";
import test from "node:test";
import { loadSessions, saveSession } from "../src/client/sessions.js";

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test("stores sessions newest first and replaces the active session", () => {
  const storage = memoryStorage();
  saveSession({ id: "one", stepIndex: 1 }, storage);
  saveSession({ id: "one", stepIndex: 2 }, storage);
  saveSession({ id: "two", stepIndex: 0 }, storage);
  assert.deepEqual(loadSessions(storage).map(({ id, stepIndex }) => ({ id, stepIndex })), [{ id: "two", stepIndex: 0 }, { id: "one", stepIndex: 2 }]);
});
