# HANDOFF — AI Avatar Content Factory

Context doc for any agent/dev (e.g. Codex) picking up this project cold.

## What this is
A single-page PWA: per-scene AI video generation (Atlas Cloud / Seedance) +
on-device assembly/upscale to 1080×1920 CRF 18 via ffmpeg.wasm. No backend —
everything runs in the browser except an optional local relay (see below).

- **Live:** https://tdeals928-commits.github.io/video-upscaler/
- **Repo:** https://github.com/tdeals928-commits/video-upscaler (this folder is the repo root)
- **Deploy:** GitHub Pages serves `main` branch, root path. Push to `main` → live in ~40–60s.

## File map
| File | Purpose |
|---|---|
| `index.html` | The entire app — UI, Atlas client, ffmpeg pipeline, caching. ~52 KB, no build step. |
| `sw.js` | Service worker (offline + update toast). **Cache name `creator-vNN` MUST be bumped on every deploy** or users keep the stale build. Currently v22. |
| `serve.js` | Local static server **+ Atlas relay** at `http://localhost:4100/api/v1` (forwards `/api/v1/*` server-side to `api.atlascloud.ai`, adds CORS). |
| `cloudflare-worker.js` | Same relay as a Cloudflare Worker. User has one deployed: `https://atlas-proxy.tdeals928.workers.dev/api/v1` (verified forwarding correctly). |
| `vendor/` | ffmpeg.wasm engine, bundled locally (31 MB wasm). Load via `coreURL`/`wasmURL`; **do NOT pass `classWorkerURL`** (forces a broken module worker). |
| `manifest.webmanifest`, `icon.svg` | PWA install metadata. |

## App flow (4 steps in the UI)
1. **API key** — stored in `localStorage.atlas_key`, sent only to Atlas (or the user's own relay). Optional endpoint override in `localStorage.atlas_base`. "Test Atlas connection" probes GET/POST/UPLOAD and prints a verdict.
2. **Scenes** — each: first-frame photo + prompt + optional reference image → Generate (Seedance) or drop a ready video. Small 9:16 preview per card; tap = lightbox.
3. **Assemble** — each clip upscaled to 1080×1920 (lanczos, pad), CRF 18, preset `veryfast` (preset affects size not quality at fixed CRF; `medium` was 2× slower in wasm), fps 30, aac 48 kHz; segments → mpegts → concat-copy → faststart MP4; optional music mixed at 0.35 volume, looped to length.
4. **Result** — preview, Save/Share (Web Share), download .mp4, or zip (final + clips + images; pure-JS store-zip, CRC32 verified).

## Atlas Cloud API (verified against official docs + user's working Python app)
- Base: `https://api.atlascloud.ai/api/v1`, auth `Authorization: Bearer <key>`.
- `POST /model/generateVideo` body (flat, NOT nested under `input`):
  `{ model: "bytedance/seedance-v1.5-pro/image-to-video", prompt, image, last_image?, aspect_ratio: "9:16", duration: 8, resolution: "480p", generate_audio: true, camera_fixed: false, seed: -1 }`
  - `image` accepts a URL **or base64**. The app sends a **base64 data-URI inline**
    (image pre-compressed to ≤1024px JPEG; auto-retries at 640/384px if the
    network drops the request; retries bare base64 if a data-URI gets a 400).
  - `POST /model/uploadMedia` (multipart `file` → `{url}`) exists but is **no longer used** (see issue below).
- Response id at `data.id` (tolerant extractor `deepFindId` handles variants).
- Poll `GET /model/prediction/{id}` every 4s → `data.status` ∈ processing/completed/succeeded/failed; output at `data.outputs[0]` (tolerant `pickVideoUrl` fallback).
- CORS: **verified** Atlas allows browser calls — preflight + actual responses
  echo the caller's origin (tested for both `localhost` and the github.io origin).

## OpenAI product research (Step 2)
- Key in `localStorage.openai_key`; calls go browser → `api.openai.com/v1/responses` (CORS verified OK).
- Model ladder `gpt-5.5 → gpt-5.2 → gpt-5.1 → gpt-4o`: on "model not found" errors it
  tries the next and remembers the working id in `localStorage.openai_model_ok`.
- Flow: product photos (≤4, downscaled to 768px data-URIs) → vision identify (strict
  JSON) → research prompt with `tools:[{type:"web_search"}]` (falls back to
  `web_search_preview`, then no tools). Output extracted tolerantly (`oaText`).
- Video types (`VID_TYPES`): growth30 (≈4 scenes), growth60 (≈8), product155 (≈19);
  drives the scene-target pill + CTA guidance only — assembly is unchanged.
- videoType / research / productPhotos persist in `creator_project` (photos in IDB).

## Caching (don't break this — it saves the user money)
- Clip/image blobs in IndexedDB `creator-cache`/`blobs`; project structure in `localStorage.creator_project`.
- Generation cache key = SHA-256 of image+prompt+ref+model/params (`sceneCacheKey`). Cache hit ⇒ zero Atlas calls ("cached (no charge)"). Re-generate on a done scene forces a paid run.
- Reload restores everything (`loadProject`). "Clear project & cache" wipes both.

## THE ONE UNRESOLVED ISSUE
**Symptom:** On the user's machine, Generate fails instantly with browser
`TypeError: Failed to fetch`. Diagnostic shows small GET + small JSON POST
succeed; the failure hits uploads/larger requests — and persisted even via the
Cloudflare Worker on a different domain (`workers.dev`).

**Evidence so far**
- Atlas CORS is correct (verified preflight + actual, both origins).
- The user's Cloudflare Worker forwards correctly (verified with curl: GET and
  POST-with-body return Atlas's real responses + correct ACAO).
- The same machine runs a **Python** app against the same API with no issues
  ⇒ server-side calls from this machine/network work; **browser** calls die.
- From a clean Chrome (preview) on the same Mac, all calls succeed.

**Conclusion:** the block is in the user's browser environment (most likely an
extension — ad/privacy blocker — or a request-size-sensitive filter), not the
app, not Atlas, not the network architecture.

**Mitigations already shipped (v19–v22)**
1. Multipart upload eliminated — image goes inline base64 in the JSON call,
   auto-shrinking 1024→640→384px (typical request ≈ 8 KB, verified reaching Atlas).
2. Optional endpoint override (`atlas_base`) → Cloudflare Worker relay (deployed) or
   **local relay**: `node serve.js` → `http://localhost:4100/api/v1` (server-side
   Node fetch, immune to browser blockers; verified end-to-end against Atlas).

**Next things to try if it still fails**
- Chrome **Incognito with extensions disabled** (fastest way to convict an extension), or a fresh Chrome profile.
- Open DevTools → Network tab → click Generate → inspect the failed request's
  error detail (`net::ERR_BLOCKED_BY_CLIENT` = extension; `net::ERR_*` reveals the layer).
- If localhost relay works but direct doesn't ⇒ definitively browser-level; find/disable the blocker.

## Constraints / conventions
- Quality bar is fixed: CRF 18, lanczos, 1080×1920, faststart — don't lower it.
- Never put the API key in code/repo; it lives in the user's localStorage only.
- Bump `sw.js` cache version on EVERY user-visible change.
- No build system, no dependencies — keep it a single static folder.
- Test clips: `ffmpeg -f lavfi -i testsrc=duration=2:size=270x480:rate=24 -pix_fmt yuv420p -c:v libx264 t.mp4` (+ `sine` for audio).
