# WeChat CloudRun deployment

Deploy two CloudRun services using **Dockerfile** (recommended). CLI: `yarn deploy`.

## Why Dockerfile

CloudBase builds a Docker image from the repo. Without `Dockerfile.api` / `Dockerfile.worker`, deploy fails with:

`open Dockerfile: no such file or directory`

Build and start commands live **inside the Dockerfiles**, not in separate shell fields, when using this flow.

## CLI deploy

```bash
yarn deploy
```

Uses:

| Service | Dockerfile | Container port |
|---------|------------|----------------|
| `demo2song-api` | `Dockerfile.api` | `3000` |
| `demo2song-worker` | `Dockerfile.worker` | `8080` (placeholder; worker has no HTTP) |

API listens on `API_PORT=3000` inside the image (matches cloud default port).

## Console: where to configure port / env

Open [CloudRun console](https://tcb.cloud.tencent.com/dev?envId=cloud1-d1g1m1uze12293bcd#/platform-run):

1. Click service (`demo2song-api` or `demo2song-worker`)
2. **服务设置** → **基本信息** → **监听端口** → set API to `3000`
3. **服务设置** → **环境变量** → add secrets from `.env` (see below)
4. **部署发布** → **新建版本** → upload method **本地代码** → Dockerfile name:
   - API: `Dockerfile.api`
   - Worker: `Dockerfile.worker`
5. After deploy, prefer a **custom domain** for `TARO_APP_API_BASE` if you plan to publish the mini program

CloudRun default domains are often shown as test addresses in the mini program public platform and may not be accepted into the request/uploadFile whitelist. For production, bind a custom HTTPS domain such as `api.demo2song.eexx.me`, then add the DNS CNAME record CloudRun gives you and use that custom domain in the mini program and public platform settings.

If you use **无 Dockerfile** mode instead, the console shows:

- **构建命令** / **启动命令** / **监听端口** on the version form

Prefer Dockerfile mode for this monorepo.

## API service (`demo2song-api`)

- Start command (in image): `node apps/api/dist/apps/api/src/server.js`
- Port: `3000`
- Health check: `GET /health`

Required environment variables (console **服务设置 → 环境变量**):

- `CLOUDBASE_ENV_ID`
- `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_LOGIN_STRICT=true`
- `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, `COS_REGION`
- `COS_CDN_BASE_URL` optional; if you use it, the same CDN domain also needs to be added to the mini program `downloadFile` whitelist
- `API_PORT=3000` optional if image default is used

## Worker service (`demo2song-worker`)

- Start command (in image): `node apps/worker/dist/apps/worker/src/worker.js`
- Image includes `ffmpeg`
- Public access: optional off

Required environment variables:

- `CLOUDBASE_ENV_ID`
- `COS_*`, `MINIMAX_API_KEY`, optional `MUREKA_API_KEY`
- `WORKER_POLL_INTERVAL_MS` optional
- `PROVIDER_MOCK_MODE` optional for smoke tests

## Mini program

After API is live and the custom domain points to it:

```bash
TARO_APP_API_BASE="https://api.demo2song.eexx.me" yarn build
```

Verify:

```bash
curl -sS "https://api.demo2song.eexx.me/health"
# {"ok":true}
```
