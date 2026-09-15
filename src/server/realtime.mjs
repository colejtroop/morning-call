import { readBody, sendJson } from "./http.mjs";

export function createRealtimeHandler({ apiKey, fetchImpl = fetch, sessionConfig }) {
  return async function handleRealtime(req, res) {
    const sdp = (await readBody(req)).toString("utf8");
    if (!sdp.startsWith("v=0")) {
      sendJson(res, 400, { error: "Expected a WebRTC SDP offer." });
      return;
    }

    if (!apiKey) {
      sendJson(res, 503, { error: "OPENAI_API_KEY is not configured on the server." });
      return;
    }

    const form = new FormData();
    form.set("sdp", new Blob([sdp], { type: "application/sdp" }), "offer.sdp");
    form.set("session", new Blob([JSON.stringify(sessionConfig)], { type: "application/json" }), "session.json");

    const upstream = await fetchImpl("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });

    const body = await upstream.text();
    if (!upstream.ok) {
      console.error("Realtime call failed", upstream.status);
      sendJson(res, upstream.status, { error: "Realtime call creation failed." });
      return;
    }

    res.writeHead(201, {
      "content-type": "application/sdp",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(body);
  };
}
