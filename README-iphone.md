# Video Upscaler — iPhone (in-browser) build

Re-encodes a clip to 1080p **entirely on the phone** using ffmpeg compiled to
WebAssembly. Nothing is uploaded; the engine (`vendor/`) is bundled so it also
works offline once loaded.

## What's here
- `index.html` — the whole app (UI + logic)
- `vendor/` — the ffmpeg.wasm engine (~31 MB), bundled for offline use
- `sw.js`, `manifest.webmanifest`, `icon.svg` — make it installable / offline
- `serve.js` — a tiny local static server (for testing on your Mac)

## The one catch: iPhone needs HTTPS
The Save/Share button and "Add to Home Screen" only work over **HTTPS** (a
"secure context"). Your Mac's `localhost` is secure, but your iPhone can't reach
`localhost`. So to run it on the phone, put these files on an HTTPS URL. Pick one:

### Option A — Free static host (best, permanent)
Drag the **`iphone` folder** onto one of these (all free, instant HTTPS):
- **Netlify Drop** — https://app.netlify.com/drop
- **Cloudflare Pages** — https://pages.cloudflare.com
- **Vercel** — https://vercel.com/new

You'll get a URL like `https://your-name.netlify.app`. Open it in Safari on the
iPhone. (Make sure `vendor/ffmpeg-core.wasm` uploads — it's the big 31 MB file.)

### Option B — Quick tunnel (instant, temporary, for testing)
On the Mac:
```bash
cd /Users/guillermofletes/video-upscaler/iphone
node serve.js                      # serves http://localhost:4100
# in another terminal:
brew install cloudflared           # one-time
cloudflared tunnel --url http://localhost:4100
```
It prints a temporary `https://….trycloudflare.com` URL — open that in Safari on
your iPhone. (The tunnel exposes the app publicly while it's running; stop it with
Ctrl-C when done.)

## Using it on the iPhone
1. Open the HTTPS URL in **Safari**.
2. (Optional) Share → **Add to Home Screen** to use it like an app, offline.
3. Tap **Choose a video**, pick from Photos or Files.
4. Pick a target size + quality, tap **Upscale to 1080p**.
5. When done, tap **Save / Share** → **Save Video** (to Photos) or send straight
   to TikTok / Instagram.

## Notes & limits
- First run downloads/caches the ~31 MB engine; after that it's instant & offline.
- This is **software** H.264 encoding in the browser — slower than the Mac app,
  and the phone's memory caps how big a clip it can handle. Best for clips under
  ~1 minute. Longer/larger clips may run out of memory (you'll get a clear error).
- Upscaling 480p→1080p adds pixels, not detail. It will read as true 1080p on
  upload and look clean, but it's not the same as natively-shot 1080p.
