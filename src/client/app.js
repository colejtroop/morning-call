import { addWeightObservation, formatWeightDelta, loadWeightHistory, normalizeWeight, WEIGHT_STORAGE_KEY } from "./weight.js";
import { addConversationObservations, advanceMorningCall, buildSummary, createMorningCall, currentStep, MORNING_STEPS, recordSessionWeight } from "./morning-call.js";
import { createDemoVoice } from "./demo-voice.js";
import { loadSessions, saveSession } from "./sessions.js";
import { captureFramePreview, sampleCaptureQuality } from "./observer.js";
import { prepareFaceLandmarker, sampleFaceLandmarks, startFaceTracking } from "./face-landmarker.js";
import { aggregateFacePoses, applyPoseCalibration, validateCalibrationPose, validateFacePose } from "./face-geometry.js";
import { drawBodyOverlay, drawFaceMesh, drawFaceOverlay, screenPointToVideo } from "./face-overlay.js";
import { prepareBodyLandmarker, startBodyTracking } from "./body-landmarker.js";
import { validateBodyPose } from "./body-geometry.js";
import { extractFaceMeasurements } from "./face-measurements.js";
import { buildCaptureConditionModel, buildPersonalErrorModel, buildViewErrorModels, compareToPersonalBaseline, validateCaptureConditions } from "./measurement-model.js";

const state = { stream: null, peer: null, dataChannel: null, facingMode: "user", muted: false, timer: null, startedAt: null, mode: null, session: null, demoVoice: null };
const $ = (id) => document.getElementById(id);
const els = {
  homeView: $("homeView"), callView: $("callView"), callButton: $("callButton"), repeatabilityButton: $("repeatabilityButton"), endButton: $("endButton"), muteButton: $("muteButton"),
  flipButton: $("flipButton"), camera: $("cameraPreview"), remoteAudio: $("remoteAudio"), connectionLabel: $("connectionLabel"),
  callTimer: $("callTimer"), callStatus: $("callStatus"), transcript: $("transcript"), latestWeight: $("latestWeight"),
  weightTrend: $("weightTrend"), historyList: $("historyList"), todayLabel: $("todayLabel"), assistantPreview: $("assistantPreview"),
  weightFallback: $("weightFallback"), weightInput: $("weightInput"), clearHistory: $("clearHistory"), captureButton: $("captureButton"), faceOverlay: $("faceOverlay"), poseReadout: $("poseReadout"), yawValue: $("yawValue"), pitchValue: $("pitchValue"), rollValue: $("rollValue"),
  trackerDetail: $("trackerDetail"), skipBodyButton: $("skipBodyButton"), reviewDialog: $("reviewDialog"), reviewForm: $("reviewForm"), reviewWeight: $("reviewWeight"), reviewCaptures: $("reviewCaptures"), reviewObservations: $("reviewObservations"), reviewInferences: $("reviewInferences"), reviewError: $("reviewError"), discardReview: $("discardReview"), capturePreviewDialog: $("capturePreviewDialog"), capturePreviewImage: $("capturePreviewImage"), closeCapturePreview: $("closeCapturePreview")
};
const HAIRLINE_STORAGE_KEY = "morning-call:hairline:v1";

function releasePreviews(session) { for (const capture of session?.captures || []) if (capture.previewUrl) URL.revokeObjectURL(capture.previewUrl); }
function holdMessage(startedAt, duration = 1000) {
  const progress = Math.min(1, (performance.now() - startedAt) / duration);
  return "Hold still" + ".".repeat(Math.max(1, Math.ceil(progress * 3)));
}
const isFacePosition = (position) => position.startsWith("face_") || position.startsWith("profile_");

function renderPose(result) {
  const pose = result?.pose || null;
  const landmarks = result?.landmarks || null;
  const topology = result?.topology || null;
  const step = state.session ? currentStep(state.session) : null;
  const calibrating = step?.id === "face_calibrate";
  const adjustedPose = applyPoseCalibration(pose, state.session?.calibration);
  state.latestPose = adjustedPose;
  if (state.capturePending && adjustedPose) {
    drawFaceOverlay(els.faceOverlay, els.camera, adjustedPose, { approved: true });
    drawFaceMesh(els.faceOverlay, els.camera, landmarks, { approved: true, topology });
    if (!els.callStatus.classList.contains("captured")) els.callStatus.textContent = "Hold still...";
    return;
  }
  drawFaceOverlay(els.faceOverlay, els.camera, adjustedPose, { calibrating });
  state.meshRenderFrame = (state.meshRenderFrame || 0) + 1;
  drawFaceMesh(els.faceOverlay, els.camera, landmarks, { topology, dense: state.meshRenderFrame % 2 === 0 });
  els.poseReadout.classList.toggle("hidden", !adjustedPose || calibrating);
  for (const [element, value] of [[els.yawValue, adjustedPose?.yaw], [els.pitchValue, adjustedPose?.pitch], [els.rollValue, adjustedPose?.roll]]) element.textContent = Number.isFinite(value) ? `${value.toFixed(1)}°` : "—";
  const regionalMotion = result?.stability ? Math.max(...Object.values(result.stability)) : null;
  els.trackerDetail.textContent = adjustedPose ? `478 anatomical landmarks · face ${(adjustedPose.width * 100).toFixed(0)}% frame · regional motion ${Number.isFinite(regionalMotion) ? (regionalMotion * 1000).toFixed(1) : "—"}‰` : "Searching for face landmarks";
  if (calibrating) {
    const approval = validateCalibrationPose(pose);
    if (!approval.ok) { state.calibrationSamples = []; state.validPoseSince = null; els.callStatus.textContent = approval.reason; return; }
    state.calibrationSamples ||= [];
    state.calibrationSamples.push(pose);
    if (state.calibrationSamples.length > 18) state.calibrationSamples.shift();
    state.validPoseSince ||= performance.now();
    els.callStatus.textContent = holdMessage(state.validPoseSince, 1200);
    drawFaceOverlay(els.faceOverlay, els.camera, adjustedPose, { calibrating: true, approved: true });
    drawFaceMesh(els.faceOverlay, els.camera, landmarks, { approved: true, topology });
    if (performance.now() - state.validPoseSince >= 1200 && state.calibrationSamples.length >= 8) {
      const baseline = aggregateFacePoses(state.calibrationSamples);
      state.session = { ...state.session, calibration: { yaw: baseline.yaw, pitch: baseline.pitch, roll: baseline.roll, calibratedAt: new Date().toISOString() } };
      state.calibrationSamples = [];
      state.validPoseSince = null;
      state.session = advanceMorningCall(state.session);
      showStep();
    }
    return;
  }
  if (step?.id === "hairline_calibrate") {
    state.latestLandmarks = landmarks;
    els.callStatus.textContent = "Tap the center of your natural hairline.";
    return;
  }
  if (!step || !isFacePosition(step.id) || !adjustedPose || state.capturePending) { state.validPoseSince = null; return; }
  const approval = validateFacePose(step.id, adjustedPose);
  if (!approval.ok) { state.validPoseSince = null; els.callStatus.textContent = approval.reason; return; }
  if (!Number.isFinite(regionalMotion) || regionalMotion > 0.006) {
    state.validPoseSince = null;
    els.callStatus.textContent = "Stabilizing face map...";
    return;
  }
  state.validPoseSince ||= performance.now();
  const heldMs = performance.now() - state.validPoseSince;
  els.callStatus.textContent = holdMessage(state.validPoseSince);
  drawFaceOverlay(els.faceOverlay, els.camera, adjustedPose, { approved: true });
  drawFaceMesh(els.faceOverlay, els.camera, landmarks, { approved: true, topology });
  if (heldMs >= 1000) captureCurrentPosition();
}

function showStep() {
  const step = currentStep(state.session);
  if (step.id === "hairline_calibrate") {
    try {
      const saved = JSON.parse(localStorage.getItem(HAIRLINE_STORAGE_KEY));
      if (saved) { state.session = advanceMorningCall({ ...state.session, hairline: saved }); showStep(); return; }
    } catch {}
  }
  els.callStatus.textContent = step.prompt;
  els.captureButton.classList.add("hidden");
  els.skipBodyButton.classList.toggle("hidden", step.id !== "body_front");
  els.faceOverlay.classList.toggle("interactive", step.id === "hairline_calibrate");
  if (step.id === "body_front") beginBodyTracking();
  state.demoVoice?.speak(step.id === "complete" ? buildSummary(state.session) : step.prompt);
  if (step.id === "complete") {
    const summary = buildSummary(state.session);
    els.assistantPreview.textContent = summary;
    els.transcript.textContent = summary;
  }
}

function showReview(session) {
  state.pendingReview = session;
  els.reviewWeight.value = session.weight?.pounds ?? "";
  els.reviewCaptures.className = "capture-grid";
  els.reviewCaptures.replaceChildren(...session.captures.map((capture) => {
    const item = document.createElement("li");
    const pose = capture.face?.pose;
    const details = pose ? ` — yaw ${pose.yaw.toFixed(1)}°, pitch ${pose.pitch.toFixed(1)}°, roll ${pose.roll.toFixed(1)}°` : "";
    const button = document.createElement("button");
    button.type = "button"; button.className = "capture-thumb";
    if (capture.previewUrl) { const image = document.createElement("img"); image.src = capture.previewUrl; image.alt = capture.position.replaceAll("_", " "); button.append(image); }
    const label = document.createElement("span"); label.textContent = capture.position.replaceAll("_", " ") + details; button.append(label);
    button.addEventListener("click", () => { if (capture.previewUrl) { els.capturePreviewImage.src = capture.previewUrl; els.capturePreviewDialog.showModal(); } });
    item.append(button);
    return item;
  }));
  els.reviewObservations.replaceChildren(...session.observations.map((observation, index) => {
    const label = document.createElement("label");
    label.className = "review-observation";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.dataset.observationIndex = String(index);
    label.append(input, document.createTextNode(observation.type.replaceAll("_", " ")));
    return label;
  }));
  const inferences = session.captures.map((capture) => {
    const item = document.createElement("li");
    const lighting = capture.quality?.lightingOk ? "lighting passed" : "lighting unavailable";
    const stability = capture.quality?.stable ? "stability passed" : "stability unavailable";
    const measurementCount = Object.keys(capture.face?.measurements?.values || {}).length;
    const measurementText = measurementCount ? `; ${measurementCount} objective face metrics` : "";
    item.textContent = `${capture.position.replaceAll("_", " ")}: alignment accepted; ${lighting}; ${stability}${measurementText}`;
    return item;
  });
  for (const skipped of session.skippedSteps || []) {
    const item = document.createElement("li");
    item.textContent = `${skipped.position.replaceAll("_", " ")}: skipped by admin`;
    inferences.push(item);
  }
  const provisionalModel = buildPersonalErrorModel([session, ...loadSessions()]);
  const modeled = Object.values(provisionalModel.metrics);
  const repeatability = document.createElement("li");
  if (!provisionalModel.ready) {
    const count = Math.max(0, ...modeled.map((metric) => metric.sampleCount));
    repeatability.textContent = `Face repeatability baseline: ${count}/${provisionalModel.minimumSamples} confirmed front captures`;
  } else {
    const reliable = modeled.filter((metric) => metric.reliability === "high" || metric.reliability === "moderate").length;
    repeatability.textContent = `Face repeatability baseline active: ${reliable}/${modeled.length} metrics usable`;
  }
  inferences.push(repeatability);
  const priorModel = buildPersonalErrorModel(loadSessions());
  const latestFront = session.captures.find((capture) => capture.position === "face_front");
  if (latestFront?.face?.measurements && priorModel.ready) {
    const comparisons = Object.entries(latestFront.face.measurements.values).map(([name, value]) => [name, compareToPersonalBaseline(value, priorModel.metrics[name])]);
    const meaningful = comparisons.filter(([, result]) => result.status === "increased" || result.status === "decreased");
    const item = document.createElement("li");
    item.textContent = meaningful.length ? `Meaningful-change candidates: ${meaningful.length}; review only after confirmation and trend persistence` : "No front-face measurements exceeded the learned noise floor";
    inferences.push(item);
  }
  if (!inferences.length) {
    const item = document.createElement("li");
    item.textContent = "No visual inference available";
    inferences.push(item);
  }
  els.reviewInferences.replaceChildren(...inferences);
  els.reviewError.textContent = "";
  els.reviewDialog.showModal();
}

function renderBody(result) {
  if (!state.session || currentStep(state.session).id !== "body_front") return;
  if (state.capturePending && result) {
    drawBodyOverlay(els.faceOverlay, els.camera, result.landmarks, { approved: true });
    if (!els.callStatus.classList.contains("captured")) els.callStatus.textContent = "Hold still...";
    return;
  }
  drawBodyOverlay(els.faceOverlay, els.camera, result?.landmarks);
  els.poseReadout.classList.toggle("hidden", !result);
  els.trackerDetail.textContent = result ? `33 body landmarks · height ${(result.measurements.bodyHeight * 100).toFixed(0)}% frame · shoulders ${result.measurements.shoulderTilt.toFixed(1)}°` : "Searching for body landmarks";
  const approval = validateBodyPose(result?.measurements);
  if (!approval.ok || state.capturePending) { state.validPoseSince = null; els.callStatus.textContent = approval.reason; return; }
  state.latestBody = result;
  state.validPoseSince ||= performance.now();
  els.callStatus.textContent = holdMessage(state.validPoseSince);
  drawBodyOverlay(els.faceOverlay, els.camera, result.landmarks, { approved: true });
  if (performance.now() - state.validPoseSince >= 1000) captureCurrentPosition();
}

async function beginBodyTracking() {
  if (state.stopBodyTracking) return;
  state.stopFaceTracking?.(); state.stopFaceTracking = null;
  drawFaceOverlay(els.faceOverlay, els.camera, null);
  els.poseReadout.classList.add("hidden");
  try { state.stopBodyTracking = await startBodyTracking(els.camera, renderBody); }
  catch (error) { console.warn("Body landmarks unavailable", error); els.callStatus.textContent = "Body tracking unavailable. Use manual capture."; els.captureButton.textContent = "CAPTURE MANUALLY"; els.captureButton.classList.remove("hidden"); }
}

function acceptTranscript(text) {
  els.transcript.textContent = text;
  state.session = addConversationObservations(state.session, text);
  if (currentStep(state.session).id !== "weight") return;
  const match = text.match(/\b(\d{2,3}(?:\.\d)?)\b/);
  if (match) saveWeight(match[1], "demo_voice");
}

function saveWeight(pounds, source = "manual") {
  const value = normalizeWeight(pounds);
  const observation = { pounds: value, source };
  if (!state.session) {
    const result = addWeightObservation(value, source);
    renderHistory(result.items);
  }
  els.assistantPreview.textContent = `${observation.pounds.toFixed(1)} lb recorded. No ceremony required.`;
  els.callStatus.textContent = `${observation.pounds.toFixed(1)} lb recorded`;
  els.weightFallback.classList.add("hidden");
  if (state.session && currentStep(state.session).id === "weight") {
    state.session = recordSessionWeight(state.session, { pounds: observation.pounds, source });
    state.session = advanceMorningCall(state.session);
    showStep();
  }
  return observation;
}

function renderHistory(items = loadWeightHistory()) {
  els.historyList.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty-history";
    li.textContent = "Your first reading will show up here.";
    els.historyList.append(li);
    els.latestWeight.textContent = "—";
    els.weightTrend.textContent = "No readings yet";
    return;
  }
  els.latestWeight.textContent = `${items[0].pounds.toFixed(1)} lb`;
  els.weightTrend.textContent = formatWeightDelta(items);
  for (const item of items.slice(0, 7)) {
    const li = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = item.recordedAt;
    time.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.recordedAt));
    const weight = document.createElement("strong");
    weight.textContent = `${item.pounds.toFixed(1)} lb`;
    li.append(time, weight);
    els.historyList.append(li);
  }
}

async function startCamera({ preserveAudio = false } = {}) {
  const priorStream = state.stream;
  const nextStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: preserveAudio ? false : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  if (preserveAudio && priorStream) {
    for (const track of priorStream.getAudioTracks()) nextStream.addTrack(track);
    priorStream.getVideoTracks().forEach((track) => track.stop());
  } else priorStream?.getTracks().forEach((track) => track.stop());
  state.stream = nextStream;
  els.camera.srcObject = state.stream;
}

function sendEvent(value) {
  if (state.dataChannel?.readyState === "open") state.dataChannel.send(JSON.stringify(value));
}

function handleFunctionCall(item) {
  if (item.name !== "record_weight") return;
  try {
    const args = JSON.parse(item.arguments || "{}");
    const record = saveWeight(args.pounds, "voice");
    sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify({ ok: true, record }) } });
  } catch (error) {
    sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify({ ok: false, error: error.message }) } });
  }
  sendEvent({ type: "response.create" });
}

function handleRealtimeEvent(event) {
  if (event.type === "session.created") {
    els.connectionLabel.textContent = "Live";
    els.connectionLabel.parentElement.classList.add("connected");
    els.callStatus.textContent = "Listening";
    sendEvent({ type: "response.create" });
  }
  if (event.type === "input_audio_buffer.speech_started") {
    els.callStatus.textContent = "Listening";
  }
  if (event.type === "response.output_audio.started") {
    els.callStatus.textContent = "Assistant speaking";
  }
  if (event.type === "response.output_audio.done") {
    els.callStatus.textContent = "Listening";
  }
  if (event.type === "conversation.item.input_audio_transcription.completed") els.transcript.textContent = event.transcript || "";
  if (event.type === "response.done") for (const item of event.response?.output || []) if (item.type === "function_call") handleFunctionCall(item);
  if (event.type === "error") {
    console.error(event.error);
    els.callStatus.textContent = event.error?.message || "Voice connection error";
    els.weightFallback.classList.remove("hidden");
  }
}

async function connectRealtime() {
  state.peer = new RTCPeerConnection();
  state.peer.ontrack = (event) => { els.remoteAudio.srcObject = event.streams[0]; };
  for (const track of state.stream.getAudioTracks()) state.peer.addTrack(track, state.stream);
  state.dataChannel = state.peer.createDataChannel("oai-events");
  state.dataChannel.addEventListener("message", (message) => {
    try { handleRealtimeEvent(JSON.parse(message.data)); }
    catch (error) { console.error("Bad realtime event", error); }
  });
  const offer = await state.peer.createOffer();
  await state.peer.setLocalDescription(offer);
  const response = await fetch("/api/realtime-call", { method: "POST", headers: { "content-type": "application/sdp" }, body: offer.sdp });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Could not connect the AI voice.");
  }
  await state.peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  els.callTimer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}

async function beginCall({ repeatability = false } = {}) {
  els.homeView.classList.add("hidden");
  els.callView.classList.remove("hidden");
  els.connectionLabel.textContent = "Connecting";
  els.callStatus.textContent = "Starting camera…";
  state.startedAt = Date.now();
  state.session = createMorningCall();
  state.repeatabilityTarget = repeatability ? 5 : 0;
  state.timer = setInterval(updateTimer, 1000);
  updateTimer();
  try {
    await startCamera();
    prepareFaceLandmarker().then(() => startFaceTracking(els.camera, renderPose)).then((stop) => { state.stopFaceTracking = stop; }).catch((error) => {
      console.warn("Face landmarks unavailable", error);
      els.callStatus.textContent = "Face tracking unavailable. Use manual capture.";
      els.captureButton.textContent = "CAPTURE MANUALLY";
      els.captureButton.classList.remove("hidden");
    });
    const health = await fetch("/api/health").then((response) => response.json()).catch(() => ({ voiceConfigured: false }));
    if (health.voiceConfigured) {
      state.mode = "realtime";
      els.callStatus.textContent = "Connecting assistant…";
      await connectRealtime();
    } else {
      state.mode = "demo";
      state.demoVoice = createDemoVoice({ onTranscript: acceptTranscript });
      state.demoVoice.start();
      els.connectionLabel.textContent = "Demo";
      els.connectionLabel.parentElement.classList.add("connected");
      els.weightFallback.classList.remove("hidden");
      showStep();
    }
  } catch (error) {
    console.error(error);
    els.connectionLabel.textContent = "Offline";
    els.callStatus.textContent = error.message;
    els.weightFallback.classList.remove("hidden");
  }
}

function endCall() {
  clearInterval(state.timer);
  state.timer = null;
  state.dataChannel?.close();
  state.peer?.close();
  state.stream?.getTracks().forEach((track) => track.stop());
  state.demoVoice?.stop();
  state.stopFaceTracking?.();
  state.stopBodyTracking?.();
  if (state.session && !state.session.completedAt) releasePreviews(state.session);
  renderPose(null);
  const completedSession = state.session?.completedAt ? state.session : null;
  Object.assign(state, { stream: null, peer: null, dataChannel: null, muted: false, mode: null, session: null, demoVoice: null });
  els.camera.srcObject = null;
  els.remoteAudio.srcObject = null;
  els.muteButton.classList.remove("active");
  els.weightFallback.classList.add("hidden");
  els.callView.classList.add("hidden");
  els.homeView.classList.remove("hidden");
  renderHistory();
  if (completedSession) showReview(completedSession);
}

els.callButton.addEventListener("click", () => beginCall());
els.repeatabilityButton.addEventListener("click", () => beginCall({ repeatability: true }));
els.endButton.addEventListener("click", endCall);
els.muteButton.addEventListener("click", () => {
  state.muted = !state.muted;
  state.stream?.getAudioTracks().forEach((track) => { track.enabled = !state.muted; });
  els.muteButton.classList.toggle("active", state.muted);
});
els.flipButton.addEventListener("click", async () => {
  state.facingMode = state.facingMode === "user" ? "environment" : "user";
  try { await startCamera({ preserveAudio: true }); }
  catch (error) { els.callStatus.textContent = error.message; }
});
async function captureCurrentPosition() {
  if (!state.session || currentStep(state.session).id === "complete") return;
  if (state.capturePending) return;
  state.capturePending = true;
  els.captureButton.disabled = true;
  els.callStatus.textContent = "Hold still…";
  try {
    const quality = await sampleCaptureQuality(els.camera);
    if (!quality.lightingOk) throw new Error("Lighting is insufficient. Adjust it and retry.");
    if (!quality.stable) throw new Error("Too much movement. Hold still and retry.");
    const position = currentStep(state.session).id;
    let face = null;
    if (isFacePosition(position)) {
      face = await sampleFaceLandmarks(els.camera);
      face.pose = applyPoseCalibration(face.pose, state.session.calibration);
      const approval = validateFacePose(position, face.pose);
      if (!approval.ok) throw new Error(approval.reason);
      const condition = validateCaptureConditions(face.pose.width, buildCaptureConditionModel(loadSessions(), position));
      if (!condition.ok) throw new Error(condition.reason);
      face.measurements = extractFaceMeasurements(face.landmarks, face.landmarkUncertainty, { view: position, hairline: state.session.hairline });
    }
    const body = position === "body_front" ? state.latestBody : null;
    if (position === "body_front") { const approval = validateBodyPose(body?.measurements); if (!approval.ok) throw new Error(approval.reason); }
    const previewUrl = await captureFramePreview(els.camera);
    state.session = advanceMorningCall(state.session, { observer: face ? "face_landmarker_v1" : body ? "body_landmarker_v1" : "frame_quality_v1", quality, face, body, previewUrl });
    if (state.repeatabilityTarget && position === "face_front") {
      const count = state.session.captures.filter((capture) => capture.position === "face_front").length;
      state.session = { ...state.session, repeatabilityProtocol: { target: state.repeatabilityTarget, completed: count } };
      state.session.stepIndex = count < state.repeatabilityTarget
        ? MORNING_STEPS.findIndex((step) => step.id === "face_front")
        : MORNING_STEPS.findIndex((step) => step.id === "complete");
      if (count >= state.repeatabilityTarget) state.session.completedAt = new Date().toISOString();
    }
    state.validPoseSince = null;
    els.callStatus.textContent = "Captured!";
    els.callStatus.classList.add("captured");
    await new Promise((resolve) => setTimeout(resolve, 650));
    els.callStatus.classList.remove("captured");
    showStep();
  } catch (error) {
    state.validPoseSince = null;
    els.callStatus.textContent = error.message;
  } finally {
    els.captureButton.disabled = false;
    state.capturePending = false;
  }
}
els.captureButton.addEventListener("click", captureCurrentPosition);
els.reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const pending = state.pendingReview;
    const pounds = normalizeWeight(els.reviewWeight.value);
    const retained = [...els.reviewObservations.querySelectorAll("input:checked")].map((input) => pending.observations[Number(input.dataset.observationIndex)]);
    const cleanedCaptures = pending.captures.map(({ previewUrl, ...capture }) => capture);
    const confirmedAt = new Date().toISOString();
    const provisional = { ...pending, weight: { ...pending.weight, pounds }, observations: retained, captures: cleanedCaptures, confirmedAt };
    const history = [provisional, ...loadSessions()];
    const session = { ...provisional, measurementModelSnapshot: buildPersonalErrorModel(history), viewMeasurementModels: buildViewErrorModels(history) };
    addWeightObservation(pounds, session.weight.source || "reviewed");
    saveSession(session);
    releasePreviews(pending);
    state.pendingReview = null;
    els.reviewDialog.close();
    els.assistantPreview.textContent = buildSummary(session);
    renderHistory();
  } catch (error) {
    els.reviewError.textContent = error.message;
  }
});
els.discardReview.addEventListener("click", () => {
  releasePreviews(state.pendingReview);
  state.pendingReview = null;
  els.reviewDialog.close();
});
els.closeCapturePreview.addEventListener("click", () => els.capturePreviewDialog.close());
els.faceOverlay.addEventListener("click", (event) => {
  if (!state.session || currentStep(state.session).id !== "hairline_calibrate") return;
  const hairline = { ...screenPointToVideo(els.faceOverlay, els.camera, event.clientX, event.clientY), calibratedAt: new Date().toISOString() };
  localStorage.setItem(HAIRLINE_STORAGE_KEY, JSON.stringify(hairline));
  state.session = advanceMorningCall({ ...state.session, hairline });
  showStep();
});
els.skipBodyButton.addEventListener("click", () => {
  if (!state.session || currentStep(state.session).id !== "body_front") return;
  state.stopBodyTracking?.(); state.stopBodyTracking = null;
  state.session = { ...state.session, skippedSteps: [...(state.session.skippedSteps || []), { position: "body_front", reason: "admin_skip", skippedAt: new Date().toISOString() }] };
  state.session = advanceMorningCall(state.session);
  drawBodyOverlay(els.faceOverlay, els.camera, null);
  showStep();
});
els.weightFallback.addEventListener("submit", (event) => {
  event.preventDefault();
  try { saveWeight(els.weightInput.value, "manual"); els.weightInput.value = ""; }
  catch (error) { els.callStatus.textContent = error.message; }
});
els.clearHistory.addEventListener("click", () => {
  if (confirm("Delete locally saved weight history?")) {
    localStorage.removeItem(WEIGHT_STORAGE_KEY);
    renderHistory();
  }
});

els.todayLabel.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
renderHistory();
