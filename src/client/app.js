import { addWeightObservation, formatWeightDelta, loadWeightHistory, normalizeWeight, WEIGHT_STORAGE_KEY } from "./weight.js";
import { addConversationObservations, advanceMorningCall, buildSummary, createMorningCall, currentStep, recordSessionWeight } from "./morning-call.js";
import { createDemoVoice } from "./demo-voice.js";
import { saveSession } from "./sessions.js";
import { sampleCaptureQuality } from "./observer.js";
import { prepareFaceLandmarker, sampleFaceLandmarks, startFaceTracking } from "./face-landmarker.js";
import { aggregateFacePoses, applyPoseCalibration, validateCalibrationPose, validateFacePose } from "./face-geometry.js";
import { drawFaceOverlay } from "./face-overlay.js";

const state = { stream: null, peer: null, dataChannel: null, facingMode: "user", muted: false, timer: null, startedAt: null, mode: null, session: null, demoVoice: null };
const $ = (id) => document.getElementById(id);
const els = {
  homeView: $("homeView"), callView: $("callView"), callButton: $("callButton"), endButton: $("endButton"), muteButton: $("muteButton"),
  flipButton: $("flipButton"), camera: $("cameraPreview"), remoteAudio: $("remoteAudio"), connectionLabel: $("connectionLabel"),
  callTimer: $("callTimer"), callStatus: $("callStatus"), transcript: $("transcript"), latestWeight: $("latestWeight"),
  weightTrend: $("weightTrend"), historyList: $("historyList"), todayLabel: $("todayLabel"), assistantPreview: $("assistantPreview"),
  weightFallback: $("weightFallback"), weightInput: $("weightInput"), clearHistory: $("clearHistory"), captureButton: $("captureButton"), faceOverlay: $("faceOverlay"), poseReadout: $("poseReadout"), yawValue: $("yawValue"), pitchValue: $("pitchValue"), rollValue: $("rollValue"),
  reviewDialog: $("reviewDialog"), reviewForm: $("reviewForm"), reviewWeight: $("reviewWeight"), reviewCaptures: $("reviewCaptures"), reviewObservations: $("reviewObservations"), reviewInferences: $("reviewInferences"), reviewError: $("reviewError"), discardReview: $("discardReview")
};

function renderPose(pose) {
  const step = state.session ? currentStep(state.session) : null;
  const calibrating = step?.id === "face_calibrate";
  const adjustedPose = applyPoseCalibration(pose, state.session?.calibration);
  state.latestPose = adjustedPose;
  drawFaceOverlay(els.faceOverlay, els.camera, adjustedPose, { calibrating });
  els.poseReadout.classList.toggle("hidden", !adjustedPose || calibrating);
  for (const [element, value] of [[els.yawValue, adjustedPose?.yaw], [els.pitchValue, adjustedPose?.pitch], [els.rollValue, adjustedPose?.roll]]) element.textContent = Number.isFinite(value) ? `${value.toFixed(1)}°` : "—";
  if (calibrating) {
    const approval = validateCalibrationPose(pose);
    if (!approval.ok) { state.calibrationSamples = []; state.validPoseSince = null; els.callStatus.textContent = approval.reason; return; }
    state.calibrationSamples ||= [];
    state.calibrationSamples.push(pose);
    if (state.calibrationSamples.length > 18) state.calibrationSamples.shift();
    state.validPoseSince ||= performance.now();
    els.callStatus.textContent = approval.reason;
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
  if (!step?.id.startsWith("face_") || !adjustedPose || state.capturePending) { state.validPoseSince = null; return; }
  const approval = validateFacePose(step.id, adjustedPose);
  if (!approval.ok) { state.validPoseSince = null; els.callStatus.textContent = approval.reason; return; }
  state.validPoseSince ||= performance.now();
  const heldMs = performance.now() - state.validPoseSince;
  els.callStatus.textContent = heldMs >= 250 ? "Hold still…" : approval.reason;
  if (heldMs >= 1000) captureCurrentPosition();
}

function showStep() {
  const step = currentStep(state.session);
  els.callStatus.textContent = step.prompt;
  els.captureButton.classList.toggle("hidden", step.id === "weight" || step.id === "complete");
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
  els.reviewCaptures.replaceChildren(...session.captures.map((capture) => {
    const item = document.createElement("li");
    const pose = capture.face?.pose;
    const details = pose ? ` — yaw ${pose.yaw.toFixed(1)}°, pitch ${pose.pitch.toFixed(1)}°, roll ${pose.roll.toFixed(1)}°` : "";
    item.textContent = capture.position.replaceAll("_", " ") + details;
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
    item.textContent = `${capture.position.replaceAll("_", " ")}: alignment accepted; ${lighting}; ${stability}`;
    return item;
  });
  if (!inferences.length) {
    const item = document.createElement("li");
    item.textContent = "No visual inference available";
    inferences.push(item);
  }
  els.reviewInferences.replaceChildren(...inferences);
  els.reviewError.textContent = "";
  els.reviewDialog.showModal();
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

async function beginCall() {
  els.homeView.classList.add("hidden");
  els.callView.classList.remove("hidden");
  els.connectionLabel.textContent = "Connecting";
  els.callStatus.textContent = "Starting camera…";
  state.startedAt = Date.now();
  state.session = createMorningCall();
  state.timer = setInterval(updateTimer, 1000);
  updateTimer();
  try {
    await startCamera();
    prepareFaceLandmarker().then(() => startFaceTracking(els.camera, renderPose)).then((stop) => { state.stopFaceTracking = stop; }).catch((error) => console.warn("Face landmarks unavailable", error));
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

els.callButton.addEventListener("click", beginCall);
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
    if (position.startsWith("face_")) {
      face = await sampleFaceLandmarks(els.camera);
      face.pose = applyPoseCalibration(face.pose, state.session.calibration);
      const approval = validateFacePose(position, face.pose);
      if (!approval.ok) throw new Error(approval.reason);
    }
    state.session = advanceMorningCall(state.session, { observer: face ? "face_landmarker_v1" : "frame_quality_v1", quality, face });
    state.validPoseSince = null;
    showStep();
  } catch (error) {
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
    const session = { ...pending, weight: { ...pending.weight, pounds }, observations: retained, confirmedAt: new Date().toISOString() };
    addWeightObservation(pounds, session.weight.source || "reviewed");
    saveSession(session);
    state.pendingReview = null;
    els.reviewDialog.close();
    els.assistantPreview.textContent = buildSummary(session);
    renderHistory();
  } catch (error) {
    els.reviewError.textContent = error.message;
  }
});
els.discardReview.addEventListener("click", () => {
  state.pendingReview = null;
  els.reviewDialog.close();
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
