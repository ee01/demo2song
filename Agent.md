# Agent Harness

This file records the local verification harness for future agents working on this repo. Do not commit or print secrets from `.env`.

## Command Reference

| 目的 | 命令 |
|------|------|
| **本地开发**：启动小程序热更新编译（API 指向 localhost） | `yarn dev` |
| **本地开发**：编译小程序本地版本（API 指向 localhost） | `yarn build:local` |
| **本地开发**：启动 API 服务（端口 3100） | `yarn dev:api` |
| **本地开发**：启动 Worker（真实 provider） | `yarn dev:worker` |
| **本地开发**：启动 Worker（Mock 模式，不消耗配额） | `PROVIDER_MOCK_MODE=true yarn dev:worker` |
| **小程序发布**：编译可上传版本（API 指向生产后端） | `yarn build` |
| **后端发布**：一键推送 api + worker 到云托管 | `yarn deploy` |
| **后端发布**：单独部署 API | `yarn deploy:api` |
| **后端发布**：单独部署 Worker | `yarn deploy:worker` |
| **后端验证**：本地验证云托管构建是否可通过 | `yarn build:cloudrun` |
| **静态检查** | `yarn typecheck && yarn test` |
| **配置校验** | `yarn config:validate` |

> `yarn dev` = `yarn dev:mp`，`yarn build` = 小程序生产编译，`yarn build:local` = 小程序本地 API 编译，`yarn deploy` = `yarn deploy:cloudrun`

## Agent Workflow: New Feature Completion

When a new feature is completed, the agent MUST follow this sequence in order:

1. **静态检查**（mandatory）

   ```bash
   yarn config:validate
   yarn typecheck
   yarn test
   ```

2. **本地端到端验证**（mandatory，见下方 E2E Validation 章节）

3. **后端部署**（如需上线后端变更）

   ```bash
   yarn deploy          # 同时部署 api + worker
   yarn deploy:api      # 仅部署 API
   yarn deploy:worker   # 仅部署 Worker
   ```

   > **原则**：凡是配置或代码变更已经到达可线上验证的程度，agent 应直接执行部署，无需等待用户再次确认。

4. **小程序生产编译并上传**（如小程序有变更）

   ```bash
   yarn build
   # 然后在微信开发者工具中「上传」
   ```

Do not skip any step. If a step fails, fix the issue before proceeding.

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
- `/compile?projectpath=...` returned `404` in this DevTools version; prefer `yarn dev:mp` for watch compilation, `yarn build:local` for localhost compilation, or `yarn build` for production compilation.

## Mini Program API Base

The mini program API base is compiled into the Taro build as `__API_BASE__`.

Default production value:

```text
https://api.demo2song.eexx.me
```

Local development commands set this explicitly to:

```text
http://localhost:3100
```

Use `yarn build` for the production API build and `yarn build:local` for a local API build.

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

For local API mini program verification:

```bash
yarn build:local
```

## E2E Validation (Local End-to-End)

After any backend change, run the full local chain to verify the flow:

```bash
# 1. Start API and worker in mock mode (separate terminals)
yarn dev:api
PROVIDER_MOCK_MODE=true yarn dev:worker

# 2. Health check
curl -sS http://127.0.0.1:3100/health

# 3. Login → get userId
USER_ID=$(curl -sS -X POST http://127.0.0.1:3100/auth/wechat-login \
  -H 'content-type: application/json' \
  --data '{"code":"test-code"}' | node -e "process.stdin.setEncoding('utf8');let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>console.log(JSON.parse(b).userId))")
echo "userId=$USER_ID"

# 4. Upload a recording (use any mp3 file)
RECORDING=$(curl -sS -X POST http://127.0.0.1:3100/recordings \
  -H "x-user-id: $USER_ID" \
  -F "audio=@/path/to/test.mp3")
RECORDING_ID=$(echo $RECORDING | node -e "process.stdin.setEncoding('utf8');let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>console.log(JSON.parse(b).recording?.id))")
echo "recordingId=$RECORDING_ID"

# 5. Submit generation job
JOB=$(curl -sS -X POST http://127.0.0.1:3100/songs/demo-jobs \
  -H "x-user-id: $USER_ID" \
  -H 'content-type: application/json' \
  --data "{\"recordingId\":\"$RECORDING_ID\",\"prompt\":\"e2e test\"}")
echo "$JOB"
```

In mock mode the worker completes immediately and marks the song ready. Verify:
- Worker log shows job picked up and completed
- Song record in CloudBase shows `status: ready`
- `GET /songs/:id/play` returns a signed COS URL

## Deployment: WeChat CloudRun (云托管)

### 一键部署

确保 `.env` 中已配置所有服务密钥，然后：

```bash
yarn deploy
```

**脚本工作原理（`scripts/deploy-cloudrun.mjs`）：**

1. 读取 `.env` 中所有环境变量
2. 从 `Dockerfile.api` / `Dockerfile.worker` 模板生成临时 `Dockerfile`（根目录），在最后一个 `FROM` 之后自动插入 `ENV KEY="value"` 层
3. 用 `tcb cloudrun deploy` 上传源码到云端构建（含注入了环境变量的 Dockerfile）
4. 部署完成后删除临时 `Dockerfile`（已加入 `.gitignore`，不会进入版本历史）

云端 API **监听端口 3000**（本地 dev 用 3100）。

控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-d1g1m1uze12293bcd#/platform-run

**依赖前置条件**（仅需一次）：在控制台手动开通云托管后，服务会自动创建。

### 部署后验证

### 部署后验证

```bash
CLOUD_API=https://api.demo2song.eexx.me
curl -sS $CLOUD_API/health
curl -sS $CLOUD_API/config/public
```

## Mini Program Production Build

### 关键说明

`yarn build` and `npm run build -w @demo2song/mp-weixin` compile a production mini program whose `__API_BASE__` points to `https://api.demo2song.eexx.me`.

`yarn dev`（即 `yarn dev:mp`）和 `yarn build:local` 编译出的版本 `__API_BASE__` 指向 `http://localhost:3100`，**仅适用于本地开发和 DevTools 调试，不能上传发布**。

发布时优先使用自定义 HTTPS 域名，例如 `api.demo2song.eexx.me`。CloudRun 默认域名经常会被微信公众平台识别为测试地址，不能直接加入合法域名白名单。

### 生产版本编译步骤

直接编译生产版本：

```bash
yarn build
```

编译产物在 `apps/mp-weixin/dist`，通过微信开发者工具「上传」功能提交到微信后台。

### 验证编译产物指向正确地址

```bash
rg -n "__API_BASE__|localhost" apps/mp-weixin/dist -g '!**/*.map' | head -5
```

确认输出中 `__API_BASE__` 已替换为云托管域名，不含 `localhost`。

### 上传代码流程

1. 完成生产编译，确认无 `localhost` 泄漏
2. 微信开发者工具 → 打开 `apps/mp-weixin` 项目
3. 点击「上传」→ 填写版本号和备注
4. 登录[微信公众平台](https://mp.weixin.qq.com) → 版本管理 → 提交审核或设为体验版

## Common Issues

- `ReferenceError: process is not defined` in DevTools means a Node global leaked into mini program runtime. Replace with a Taro compile-time constant.
- `/auth/wechat-login` returns `invalid code` when using synthetic or expired devtools codes. For local development, keep `WECHAT_LOGIN_STRICT=false`.
- `POST /songs/demo-jobs` returning `RECORDING_NOT_FOUND` after a successful upload usually points to a user id mismatch or a CloudBase adapter/query issue.
- `invalid params, invalid audio file` from MiniMax can be caused by MiniMax failing to consume a signed COS URL. The worker sends `audio_base64` for MiniMax to avoid this path.
- `invalid params, invalid audio file` can also be caused by WeChat DevTools recordings that are actually WebM/Opus despite an `.mp3` filename. The worker uses `ffmpeg` to normalize references to MP3 before provider calls.
- `This Music API is no longer available to new users` / HTTP 410 `status_code=2153` means MiniMax retired the free Music APIs (`music-cover-free`, `music-2.6-free`, `music-3.0-free`) on 2026-08-20. This account is an existing paying customer: set `models.minimax.demoModel` to `music-cover` and `fullModel` to `music-2.6`, then redeploy the worker. Do not switch to MiniMax Audio or self-host Music3 unless paid API access is actually gone.
- `your current token plan not support model` means the configured MiniMax model is unavailable for the account. Use `music-cover` and set `models.minimax.allowPaidModels=true`.
- `Token Plan usage limit reached` is a MiniMax account quota/credits issue, not a local app bug. Use mock mode for local harness validation until credits are available.
- `webapi_getwxaasyncsecinfo:fail` appears to be a WeChat DevTools/internal SDK warning in this environment. Prioritize actionable app/API errors around it.
- If API/worker cannot read `.env`, make sure commands are started from the repository root. The data package also loads the nearest root `.env` for local workspace scripts.
- If CloudBase reports `DATABASE_COLLECTION_NOT_EXIST`, run `yarn cloudbase:init`.
