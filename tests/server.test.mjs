import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createAppServer } from "../src/server/app.mjs";

let baseUrl;
let server;

before(async () => {
  server = createAppServer({ apiKey: "", model: "gpt-realtime" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health reports server and voice configuration state", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, voiceConfigured: false });
});

test("serves the application shell with media policy", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="callButton"/);
  assert.equal(response.headers.get("permissions-policy"), "camera=(self), microphone=(self), geolocation=()");
});

test("HEAD returns headers without a response body", async () => {
  const response = await fetch(baseUrl, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("rejects malformed SDP before checking configuration", async () => {
  const response = await fetch(`${baseUrl}/api/realtime-call`, { method: "POST", body: "not-sdp" });
  assert.equal(response.status, 400);
});

test("reports missing API configuration for valid-shaped SDP", async () => {
  const response = await fetch(`${baseUrl}/api/realtime-call`, { method: "POST", body: "v=0\r\n" });
  assert.equal(response.status, 503);
});

test("returns JSON 404 and 405 errors", async () => {
  const missing = await fetch(`${baseUrl}/missing`);
  assert.equal(missing.status, 404);
  const method = await fetch(`${baseUrl}/api/health`, { method: "DELETE" });
  assert.equal(method.status, 405);
});

test("brokers valid SDP with server-owned authorization and session config", async () => {
  let request;
  const configuredServer = createAppServer(
    { apiKey: "test-key", model: "gpt-realtime" },
    {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response("v=0\r\na=answer\r\n", { status: 201 });
      }
    }
  );
  await new Promise((resolve) => configuredServer.listen(0, "127.0.0.1", resolve));

  try {
    const address = configuredServer.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/realtime-call`, {
      method: "POST",
      body: "v=0\r\na=offer\r\n"
    });
    assert.equal(response.status, 201);
    assert.equal(await response.text(), "v=0\r\na=answer\r\n");
    assert.equal(request.url, "https://api.openai.com/v1/realtime/calls");
    assert.equal(request.options.headers.Authorization, "Bearer test-key");
    assert.equal(await request.options.body.get("sdp").text(), "v=0\r\na=offer\r\n");
    const session = JSON.parse(await request.options.body.get("session").text());
    assert.equal(session.model, "gpt-realtime");
    assert.equal(session.tools[0].name, "record_weight");
  } finally {
    await new Promise((resolve, reject) => configuredServer.close((error) => error ? reject(error) : resolve()));
  }
});
