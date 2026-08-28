# 随哼

微信小程序“按住录音哼唱 -> 补充说明/歌词片段 -> 生成完整人声歌曲”的 MVP。

## Structure

- `apps/mp-weixin`: Taro + React 微信小程序。
- `apps/api`: Fastify API，负责鉴权、上传、配额、任务创建、播放签名，部署到微信云托管。
- `apps/worker`: 异步音乐生成 worker，负责调用 provider 并转存结果，部署到微信云托管。
- `packages/shared`: 共享类型和 provider contract。
- `packages/config`: typed config、JSON Schema、配置校验和 agent 配置说明。
- `packages/data`: CloudBase 云数据库 repository 和测试用内存 repository。

## Commands

```bash
yarn install
yarn config:validate
yarn typecheck
yarn test
yarn dev:api
yarn dev:worker
yarn dev:mp
```

## Configuration

运营配置在 `packages/config/config/demo2song.config.json`，修改说明见 `packages/config/AGENT_CONFIG.md`。

敏感密钥只放 `.env`，不要提交到仓库。
