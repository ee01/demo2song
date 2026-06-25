# Agent Harness

This file records the local verification harness for future agents working on this repo. Do not commit or print secrets from `.env`.

## Workspace

- Repository root: `/Users/esone.qiu/git/demo2song`
- Package manager: Yarn v1
- Main app pieces:
  - API: `apps/api`, Fastify, default port `3100`
  - Worker: `apps/worker`, long-running CloudBase job poller
  - Mini program: `apps/mp-weixin`, Taro WeChat build, output `apps/mp-weixin/dist`
- Native runtime dependency:
  - `ffmpeg` must be available on `PATH` for the worker. WeChat DevTools may upload WebM/Opus audio with an `.mp3` filename; the worker normalizes provider reference audio to real MP3 before calling MiniMax.
- Local database/storage:
  - Metadata: CloudBase collections
  - Audio files: Tencent COS

## Required Local Environment

The repo expects a root `.env`. Validate without printing secret values:

```bash
yarn config:validate
```

For local WeChat login smoke tests, keep:

```bash
WECHAT_LOGIN_STRICT=false
```

Production/cloud deployment should set:

```bash
WECHAT_LOGIN_STRICT=true
```

## One-Time CloudBase Setup

Create required CloudBase collections if missing:

```bash
yarn cloudbase:init
```

Expected collections:

- `users`
- `recordings`
- `songs`
- `song_jobs`
- `usage_quotas`
- `provider_events`

## Local Services

Start these from the repository root in separate long-running terminals:

```bash
yarn dev:api
```

```bash
yarn dev:worker
```

For a provider-independent local end-to-end harness, start the worker in mock mode:

```bash
PROVIDER_MOCK_MODE=true yarn dev:worker
```

In mock mode the MiniMax adapter returns the uploaded reference MP3 as the generated result, so the chain still verifies API upload, CloudBase jobs, worker consumption, COS song persistence, signed/public playback URL, and mini program polling without spending provider credits.

```bash
yarn dev:mp
```

Useful health checks:

```bash
curl -sS http://127.0.0.1:3100/health
curl -sS http://127.0.0.1:3100/config/public
```

Expected `/health` response:

```json
{"ok":true}
```

Local login endpoint smoke test:

```bash
curl -sS -i -X POST http://127.0.0.1:3100/auth/wechat-login \
  -H 'content-type: application/json' \
  --data '{"code":"test-code"}'
```

With `WECHAT_LOGIN_STRICT=false`, this should return `200` and a `userId` even if the WeChat devtools code is invalid.

Demo job endpoint notes:

- `POST /songs/demo-jobs` creates a generation job.
- `GET /songs/demo-jobs` is not a valid smoke test for this route.
- A `404` body of `{"error":"RECORDING_NOT_FOUND"}` means the route exists, but the supplied `recordingId` was not found for the supplied `x-user-id`.
- To verify the full backend route chain, first create a user through `/auth/wechat-login`, then upload a recording through `POST /recordings`, then pass that returned `recording.id` to `POST /songs/demo-jobs`.

## WeChat DevTools Harness

The local WeChat Developer Tools service port is configured as:

```text
57488
```

Project path to open:

```text
/Users/esone.qiu/git/demo2song/apps/mp-weixin
```

Open the project through the DevTools HTTP port:

```bash
python3 - <<'PY'
from urllib.parse import quote
import urllib.request

project = '/Users/esone.qiu/git/demo2song/apps/mp-weixin'
url = 'http://127.0.0.1:57488/open?projectpath=' + quote(project)
with urllib.request.urlopen(url, timeout=10) as response:
    print(response.status)
    print(response.read().decode('utf-8', 'replace')[:1000])
PY
```

Generate a preview QR code through the DevTools HTTP port:

```bash
node -r dotenv/config - <<'NODE'
const http = require('http');
const { URLSearchParams } = require('url');

function request(url, redirects = 0) {
  http.get(url, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 3) {
        request(new URL(res.headers.location, url).toString(), redirects + 1);
        return;
      }
      console.log('status', res.statusCode);
      console.log(body.slice(0, 4000));
      process.exit(res.statusCode >= 400 ? 1 : 0);
    });
  }).on('error', (err) => {
    console.error(err.message);
    process.exit(1);
  });
}

const params = new URLSearchParams({
  project: '/Users/esone.qiu/git/demo2song/apps/mp-weixin',
  appid: process.env.WECHAT_APP_ID || '',
  'qr-format': 'terminal'
});

request(`http://127.0.0.1:57488/preview?${params.toString()}`);
NODE
```

Notes:

- `/open?projectpath=...` has returned `200 {}` in this environment.
- `/preview?project=...&appid=...&qr-format=terminal` redirects to `/v2/preview` and has returned `200` with a terminal QR code.
- `/compile?projectpath=...` returned `404` in this DevTools version; prefer `yarn dev:mp` or `npm run build -w @demo2song/mp-weixin` for compilation.

## Mini Program API Base

The mini program API base is compiled into the Taro build as `__API_BASE__`.

Default local value:

```text
http://localhost:3100
```

To build against a deployed API, set `TARO_APP_API_BASE` in the root `.env` before running the Taro build.

Important: mini program runtime must not reference Node globals such as `process`. Check generated output when changing config:

```bash
rg -n "process\\.env|const i=process|process is not defined" apps/mp-weixin/dist -g '!**/*.map' || true
```

## Validation Commands

Run these after meaningful code changes:

```bash
yarn config:validate
yarn typecheck
yarn test
yarn build
```

For faster mini program-only verification:

```bash
npm run build -w @demo2song/mp-weixin
```

## Common Issues

- `ReferenceError: process is not defined` in DevTools means a Node global leaked into mini program runtime. Replace with a Taro compile-time constant.
- `/auth/wechat-login` returns `invalid code` when using synthetic or expired devtools codes. For local development, keep `WECHAT_LOGIN_STRICT=false`.
- `POST /songs/demo-jobs` returning `RECORDING_NOT_FOUND` after a successful upload usually points to a user id mismatch or a CloudBase adapter/query issue.
- `invalid params, invalid audio file` from MiniMax can be caused by MiniMax failing to consume a signed COS URL. The worker sends `audio_base64` for MiniMax to avoid this path.
- `invalid params, invalid audio file` can also be caused by WeChat DevTools recordings that are actually WebM/Opus despite an `.mp3` filename. The worker uses `ffmpeg` to normalize references to MP3 before provider calls.
- `your current token plan not support model` means the configured MiniMax model is unavailable for the account. Use `music-cover` and set `models.minimax.allowPaidModels=true`.
- `Token Plan usage limit reached` is a MiniMax account quota/credits issue, not a local app bug. Use mock mode for local harness validation until credits are available.
- `webapi_getwxaasyncsecinfo:fail` appears to be a WeChat DevTools/internal SDK warning in this environment. Prioritize actionable app/API errors around it.
- If API/worker cannot read `.env`, make sure commands are started from the repository root. The data package also loads the nearest root `.env` for local workspace scripts.
- If CloudBase reports `DATABASE_COLLECTION_NOT_EXIST`, run `yarn cloudbase:init`.
