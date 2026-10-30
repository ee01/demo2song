import { createServer } from "node:http";

// 立刻启动健康检查服务器 —— 必须在所有其他 import 之前完成，
// 保证就算后续模块加载或 env 解析失败，云托管探针也能收到 200。
const healthPort = Number(process.env.WORKER_PORT ?? 3000);
await new Promise<void>((resolve) => {
  createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  }).listen(healthPort, () => {
    console.log(`[worker] health server listening on :${healthPort}`);
    resolve();
  });
});

// 健康服务器已就绪，再加载业务模块（动态 import 保证顺序在上面之后）
const { loadValidatedConfig } = await import("@demo2song/config");
const { repository } = await import("./db.js");
const { env } = await import("./env.js");
const { createProvider } = await import("./providers/index.js");
const { WorkerCosStorage } = await import("./storage.js");
const { notifyJob } = await import("./notifiers/index.js");

const config = loadValidatedConfig();
const storage = new WorkerCosStorage();

const { createJobProcessor } = await import("./processor.js");
const processOneJob = createJobProcessor({ repository, storage, config, createProvider, notifyJob });

async function cleanupDeletedUsers(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const user of await repository.listDeletedUsersBefore(cutoff)) {
    if (await repository.countActiveJobsForUser(user.id)) continue;
    const recordings = await repository.listRecordingsForUser(user.id);
    const songs = await repository.listSongsForUser(user.id);
    // Keep DB rows until every COS deletion succeeds, so retries retain the object keys.
    for (const key of new Set([...recordings.map(record => record.objectKey), ...songs.map(song => song.objectKey)].filter((key): key is string => !!key))) await storage.deleteObject(key);
    await repository.purgeUserData(user.id);
  }
}
async function loop(): Promise<void> {
  let lastCleanup = 0;
  for (;;) {
    if (Date.now() - lastCleanup > 86400000) {
      await cleanupDeletedUsers().catch(error => console.error("Account cleanup failed", error instanceof Error ? error.message : "unknown"));
      lastCleanup = Date.now();
    }
    const processed = await processOneJob();
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
    }
  }
}

await loop();
