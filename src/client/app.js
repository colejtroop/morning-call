import { addWeightObservation, formatWeightDelta, loadWeightHistory, WEIGHT_STORAGE_KEY } from "./weight.js";

const state = { stream: null, peer: null, dataChannel: null, facingMode: "user", muted: false, timer: null, startedAt: null };
const $ = (id) => document.getElementById(id);
const els = {
  homeView: $("homeView"), callView: $("callView"), callButton: $("callButton"), endButton: $("endButton"), muteButton: $("muteButton"),
  flipButton: $("flipButton"), camera: $("cameraPreview"), remoteAudio: $("remoteAudio"), connectionLabel: $("connectionLabel"),
  callTimer: $("callTimer"), callStatus: $("callStatus"), transcript: $("transcript"), latestWeight: $("latestWeight"),
  weightTrend: $("weightTrend"), historyList: $("historyList"), todayLabel: $("todayLabel"), assistantPreview: $("assistantPreview"),
  voiceOrb: $("voiceOrb"), weightFallback: $("weightFallback"), weightInput: $("weightInput"), clearHistory: $("clearHistory")
};

function saveWeight(pounds, source = "manual") {
  const { items, observation } = addWeightObservation(pounds, source);
  renderHistory(items);
  els.assistantPreview.textContent = `${observation.pounds.toFixed(1)} lb recorded. No ceremony required.`;
  els.callStatus.textContent = `${observation.pounds.toFixed(1)} lb recorded`;
  els.weightFallback.classList.add("hidden");
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
    els.voiceOrb.classList.remove("speaking");
  }
  if (event.type === "response.output_audio.started") {
    els.callStatus.textContent = "Assistant speaking";
    els.voiceOrb.classList.add("speaking");
  }
  if (event.type === "response.output_audio.done") {
    els.callStatus.textContent = "Listening";
    els.voiceOrb.classList.remove("speaking");
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
  state.timer = setInterval(updateTimer, 1000);
  updateTimer();
  try {
    await startCamera();
    els.callStatus.textContent = "Connecting assistant…";
    await connectRealtime();
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
  Object.assign(state, { stream: null, peer: null, dataChannel: null, muted: false });
  els.camera.srcObject = null;
  els.remoteAudio.srcObject = null;
  els.muteButton.classList.remove("active");
  els.weightFallback.classList.add("hidden");
  els.callView.classList.add("hidden");
  els.homeView.classList.remove("hidden");
  renderHistory();
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
