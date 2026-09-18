export const MORNING_STEPS = Object.freeze([
  { id: "weight", prompt: "Morning. Weight?", requiresWeight: true },
  { id: "face_calibrate", prompt: "Look straight ahead. Put your eyes in the guides." },
  { id: "face_front", prompt: "Camera up. Face forward." },
  { id: "face_left", prompt: "Turn slightly left." },
  { id: "face_right", prompt: "Other side." },
  { id: "body_front", prompt: "Step back. Face forward and relax." },
  { id: "complete", prompt: "Done." }
]);

export function createMorningCall(now = new Date()) {
  return { id: crypto.randomUUID(), startedAt: now.toISOString(), completedAt: null, stepIndex: 0, weight: null, observations: [], captures: [] };
}
export function currentStep(session) { return MORNING_STEPS[session.stepIndex] || MORNING_STEPS.at(-1); }
export function recordSessionWeight(session, weight) { return { ...session, weight: { pounds: Number(weight.pounds), source: weight.source } }; }

export function addConversationObservations(session, transcript) {
  const text = String(transcript || "").trim();
  if (!text) return session;
  const observations = [];
  if (/shoulder.{0,24}(sore|hurt|pain)|(?:sore|hurt|pain).{0,24}shoulder/i.test(text)) observations.push({ type: "shoulder_soreness", value: "reported", sourceText: text });
  if (/slept (?:bad|badly|poorly)|sleep was (?:bad|awful|terrible)|like shit/i.test(text)) observations.push({ type: "poor_sleep", value: true, sourceText: text });
  return observations.length ? { ...session, observations: [...session.observations, ...observations] } : session;
}

export function advanceMorningCall(session, capture = null, now = new Date()) {
  const step = currentStep(session);
  if (step.requiresWeight && !session.weight) throw new Error("Record weight before continuing.");
  if (step.id === "complete") return session;
  const captures = capture ? [...session.captures, { position: step.id, capturedAt: now.toISOString(), ...capture }] : session.captures;
  const stepIndex = Math.min(session.stepIndex + 1, MORNING_STEPS.length - 1);
  return { ...session, captures, stepIndex, completedAt: MORNING_STEPS[stepIndex].id === "complete" ? now.toISOString() : null };
}

export function buildSummary(session) {
  const shoulder = session.observations.some((item) => item.type === "shoulder_soreness") ? " Shoulder soreness is noted." : "";
  const weight = session.weight ? session.weight.pounds.toFixed(1) : "No";
  return weight + " lb recorded. " + session.captures.length + " positions captured." + shoulder + " No visual-change inference is available yet.";
}
