# WeChat CloudRun deployment

Deploy two CloudRun services.

## API service

- Service name: `demo2song-api`
- Root directory: repository root
- Build command: `yarn install --frozen-lockfile && yarn build`
- Start command: `node apps/api/dist/apps/api/src/server.js`
- Port: `3100` or the value of `API_PORT`
- Health check: `GET /health`

Environment variables:

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_SECRET_ID` optional for local/non-platform runs
- `CLOUDBASE_SECRET_KEY` optional for local/non-platform runs
- `API_PORT`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_LOGIN_STRICT=true`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `COS_CDN_BASE_URL` optional

## Worker service

- Service name: `demo2song-worker`
- Root directory: repository root
- Build command: `yarn install --frozen-lockfile && yarn build`
- Start command: `node apps/worker/dist/apps/worker/src/worker.js`
- Public access: disabled if the platform allows it
- Health check: process liveness; worker has no HTTP endpoint in the MVP
- Runtime dependency: `ffmpeg` must be installed in the worker image/runtime so uploaded WebM/Opus recordings can be normalized to MP3 before provider calls.

Environment variables:

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_SECRET_ID` optional for local/non-platform runs
- `CLOUDBASE_SECRET_KEY` optional for local/non-platform runs
- `WORKER_POLL_INTERVAL_MS`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `MINIMAX_API_KEY`
- `MUREKA_API_KEY` optional unless `defaultProvider` is `mureka`
- `PROVIDER_MOCK_MODE` optional for smoke tests

## Mini program

Set `TARO_APP_API_BASE` to the API service domain before building the mini program for a deployed environment.
