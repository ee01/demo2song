# Agent configuration guide

Edit `packages/config/config/demo2song.config.json` for operational settings. Run `npm run config:validate` after every change.

Common requests:

- "每天每用户 5 次 demo": set `limits.dailyDemoJobsPerUser` to `5`.
- "demo 不限次数": set `limits.dailyDemoJobsPerUser` to `0`.
- "每天每用户 2 次扩歌": set `limits.dailyExtendJobsPerUser` to `2`.
- `dailyDemoJobsPerUser` 和 `dailyExtendJobsPerUser` 设为 `0` 时表示不限制，正整数表示每用户每天的上限。
- "切到 Mureka": set `defaultProvider` to `mureka` and ensure `MUREKA_API_KEY` exists in `.env`.
- "允许 MiniMax 付费模型": set `models.minimax.allowPaidModels` to `true`, then set `models.minimax.demoModel` to `music-cover` and `fullModel` to `music-2.6`。自 2026-08-20 起 `*-free` 模型已下线，不要再配置 `music-cover-free` / `music-2.6-free` / `music-3.0-free`。
- "打开完整歌": set `features.enableExtendSong` to `true`. For MiniMax-only testing, also set `features.enableApproximateMinimaxExtend` to `true`; this is approximate and does not guarantee keeping the demo.

Do not put API keys or Tencent Cloud credentials in this JSON file. Secrets belong in `.env` or the deployment secret manager.
