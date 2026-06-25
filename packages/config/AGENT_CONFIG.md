# Agent configuration guide

Edit `packages/config/config/demo2song.config.json` for operational settings. Run `npm run config:validate` after every change.

Common requests:

- "每天每用户 5 次 demo": set `limits.dailyDemoJobsPerUser` to `5`.
- "每天每用户 2 次扩歌": set `limits.dailyExtendJobsPerUser` to `2`.
- "切到 Mureka": set `defaultProvider` to `mureka` and ensure `MUREKA_API_KEY` exists in `.env`.
- "允许 MiniMax 付费模型": set `models.minimax.allowPaidModels` to `true`, then set `models.minimax.demoModel` to `music-cover` or `music-2.6`.
- "打开完整歌": set `features.enableExtendSong` to `true`. For MiniMax-only testing, also set `features.enableApproximateMinimaxExtend` to `true`; this is approximate and does not guarantee keeping the demo.

Do not put API keys or Tencent Cloud credentials in this JSON file. Secrets belong in `.env` or the deployment secret manager.
