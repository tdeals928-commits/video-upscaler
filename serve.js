// Static file server + Atlas Cloud relay.
//   node serve.js   →  http://localhost:4100
//
// RELAY: any request to /api/v1/* is forwarded server-side (Node fetch) to
// https://api.atlascloud.ai — exactly like a Python/requests app. This bypasses
// browser-level blocks (extensions, content filters) that kill direct browser
// calls to Atlas. In the web app: Step 1 → Advanced → custom API endpoint →
//   http://localhost:4100/api/v1
// (Chrome allows https pages to call http://localhost — it's a trusted origin.)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4100;
const ATLAS = "https://api.atlascloud.ai";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm", ".json": "application/json",
};

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

async function relay(req, res) {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  // Buffer the request body (images are pre-compressed by the app; small).
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = {};
  if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];

  try {
    const upstream = await fetch(ATLAS + req.url, {
      method: req.method,
      headers,
      body: (req.method === "GET" || req.method === "HEAD") ? undefined : body,
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      ...cors,
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "relay failed: " + e.message }));
  }
}

// Download relay: /fetch?url=<encoded> — server-side fetch of Atlas result files
// (their CDN sends no CORS headers, so the browser can't read them directly).
async function fetchRelay(req, res) {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let target;
  try { target = new URL(new URL(req.url, "http://x").searchParams.get("url")); } catch { target = null; }
  const okHost = target && target.protocol === "https:" &&
    (/(^|\.)aliyuncs\.com$/.test(target.hostname) || /(^|\.)atlascloud\.ai$/.test(target.hostname));
  if (!okHost) { res.writeHead(400, { ...cors, "Content-Type": "application/json" }); return res.end('{"error":"url must be an https atlas/aliyuncs link"}'); }
  try {
    const upstream = await fetch(target.href);
    if (!upstream.ok) { res.writeHead(upstream.status, cors); return res.end(); }
    res.writeHead(200, { ...cors, "Content-Type": upstream.headers.get("content-type") || "video/mp4" });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "fetch relay failed: " + e.message }));
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/v1/")) return relay(req, res);
  if (req.url.startsWith("/fetch?")) return fetchRelay(req, res);

  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(__dirname, rel));
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`\n  App + Atlas relay →  http://localhost:${PORT}\n  Relay endpoint    →  http://localhost:${PORT}/api/v1\n`));
