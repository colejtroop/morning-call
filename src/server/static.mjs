import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { sendJson } from "./http.mjs";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function createStaticHandler(root) {
  const absoluteRoot = resolve(root);

  return async function serveStatic(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const path = resolve(absoluteRoot, requested);
    const relativePath = relative(absoluteRoot, path);

    if (relativePath.startsWith("..") || relativePath.includes(":") || relativePath.startsWith("/")) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    try {
      const file = await readFile(path);
      res.writeHead(200, {
        "content-type": contentTypes[extname(path)] || "application/octet-stream",
        "content-length": file.length,
        "cache-control": path.endsWith("index.html") ? "no-cache" : "public, max-age=300",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=(self), microphone=(self), geolocation=()"
      });
      res.end(req.method === "HEAD" ? undefined : file);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") sendJson(res, 404, { error: "Not found" });
      else throw error;
    }
  };
}
