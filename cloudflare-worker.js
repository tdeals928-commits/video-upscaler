// Atlas Cloud relay — paste this whole file into a Cloudflare Worker.
// It forwards every request to api.atlascloud.ai and adds permissive CORS,
// so your browser app can reach Atlas even when atlascloud.ai is blocked
// directly. Your API key passes through your own Worker → Atlas only.
//
// In the app: Step 1 → Advanced → custom API endpoint →
//   https://<your-worker-name>.<your-subdomain>.workers.dev/api/v1

const ATLAS = "https://api.atlascloud.ai";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "86400",
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // /fetch?url=<encoded> — download Atlas result files server-side (their CDN
    // sends no CORS headers, so the browser can't read them directly).
    if (url.pathname === "/fetch") {
      let t; try { t = new URL(url.searchParams.get("url")); } catch { t = null; }
      const okHost = t && t.protocol === "https:" &&
        (/(^|\.)aliyuncs\.com$/.test(t.hostname) || /(^|\.)atlascloud\.ai$/.test(t.hostname));
      if (!okHost) return new Response('{"error":"url must be an https atlas/aliyuncs link"}', { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      try {
        const up = await fetch(t.href);
        const h = new Headers(); for (const [k, v] of Object.entries(cors)) h.set(k, v);
        h.set("Content-Type", up.headers.get("content-type") || "video/mp4");
        return new Response(up.body, { status: up.status, headers: h });
      } catch (e) {
        return new Response(JSON.stringify({ error: "fetch relay failed: " + e.message }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    // Forward the same path/query to Atlas (e.g. /api/v1/model/uploadMedia)
    const target = ATLAS + url.pathname + url.search;
    const headers = new Headers();
    const auth = request.headers.get("Authorization");
    const ct = request.headers.get("Content-Type");
    if (auth) headers.set("Authorization", auth);
    if (ct) headers.set("Content-Type", ct);

    const init = {
      method: request.method,
      headers,
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body,
    };

    let resp;
    try {
      resp = await fetch(target, init);
    } catch (e) {
      return new Response(JSON.stringify({ error: "relay failed: " + e.message }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const out = new Headers(resp.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
  },
};
