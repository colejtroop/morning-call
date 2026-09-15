import { createServer } from "node:http";
import { clientRoot, createSessionConfig } from "./config.mjs";
import { sendJson } from "./http.mjs";
import { createRealtimeHandler } from "./realtime.mjs";
import { createStaticHandler } from "./static.mjs";

export function createAppServer(config, dependencies = {}) {
  const serveStatic = createStaticHandler(dependencies.clientRoot || clientRoot);
  const handleRealtime = createRealtimeHandler({
    apiKey: config.apiKey,
    fetchImpl: dependencies.fetchImpl,
    sessionConfig: createSessionConfig(config.model)
  });

  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/health") {
        sendJson(res, 200, { ok: true, voiceConfigured: Boolean(config.apiKey) });
        return;
      }
      if (req.method === "POST" && req.url === "/api/realtime-call") {
        await handleRealtime(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        await serveStatic(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      console.error(error);
      sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Internal server error" });
    }
  });
}
