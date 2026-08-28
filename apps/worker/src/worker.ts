import { createServer } from "node:http";
import type { SongPromptInput } from "@demo2song/shared";

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
const { normalizeReferenceAudioToMp3, providerResultToBuffer } = await import("./audio.js");
const { sendGenerationNotice } = await import("./wechat-notification.js");

const config = loadValidatedConfig();
const storage = new WorkerCosStorage();

async function processOneJob(): Promise<boolean> {
  const job = await repository.claimNextQueuedJob();
  if (!job) {
    return false;
  }

  const provider = createProvider(job.provider);

  try {
    const song = job.song;
    const prompt = song.prompt as unknown as SongPromptInput;
    const providerResult =
      job.kind === "demo"
        ? await createDemo(provider, job.userId, song.recordingId, prompt, song.lyrics)
        : await createFull(provider, job.userId, song.recordingId, job.requestPayload, prompt, song.lyrics);

    const audio = await providerResultToBuffer(providerResult);
    const objectKey = `songs/${job.userId}/${song.recordingId}/${song.stage}/${song.id}.mp3`;
    await storage.putObject(objectKey, audio, providerResult.mimeType);

    await repository.updateSong(song.id, {
      status: "ready",
      providerTaskId: providerResult.providerTaskId,
      objectKey,
      mimeType: providerResult.mimeType,
      durationSeconds: providerResult.durationSeconds,
      title: providerResult.title ?? song.title,
      lyrics: providerResult.lyrics ?? song.lyrics,
      providerRaw: providerResult.raw,
      costEstimateUsd: providerResult.costEstimateUsd
    });
    await repository.updateJob(job.id, { status: "succeeded" });
    await sendGenerationNotice(job, { ...song, status: "ready", objectKey, title: providerResult.title ?? song.title });
    await repository.createProviderEvent({
      provider: job.provider,
      jobId: job.id,
      eventType: "song.generated",
      payload: providerResult.raw
    });

    return true;
  } catch (error) {
    const normalized = provider.normalizeError(error);
    await repository.updateSong(job.song.id, {
      status: "failed",
      errorCode: normalized.code,
      errorMessage: normalized.message
    });
    await repository.updateJob(job.id, {
      status: "failed",
      errorCode: normalized.code,
      errorMessage: normalized.message
    });
    await repository.createProviderEvent({
      provider: job.provider,
      jobId: job.id,
      eventType: "song.failed",
      payload: normalized
    });
    if (config.limits.refundQuotaOnProviderFailure) {
      await repository.refundQuota({ userId: job.userId, kind: job.kind });
    }
    return true;
  }
}

async function createDemo(
  provider: ReturnType<typeof createProvider>,
  userId: string,
  recordingId: string,
  prompt: SongPromptInput,
  lyrics?: string
) {
  const recording = await repository.getRecordingById(recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }
  const normalizedAudio = await normalizeReferenceAudioToMp3(await storage.getObject(recording.objectKey));
  return provider.createDemoSong({
    userId,
    recording: {
      objectKey: recording.objectKey,
      signedUrl: await storage.getSignedUrl(recording.objectKey, config.storage.signedUrlTtlSeconds),
      audioBase64: normalizedAudio.toString("base64"),
      mimeType: "audio/mpeg",
      durationSeconds: recording.durationSeconds
    },
    prompt,
    lyrics,
    targetDurationSeconds: config.limits.demoTargetSeconds
  });
}

async function createFull(
  provider: ReturnType<typeof createProvider>,
  userId: string,
  recordingId: string,
  requestPayload: unknown,
  prompt: SongPromptInput,
  lyrics?: string
) {
  const recording = await repository.getRecordingById(recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }
  const recordingInput = {
    objectKey: recording.objectKey,
    signedUrl: await storage.getSignedUrl(recording.objectKey, config.storage.signedUrlTtlSeconds),
    mimeType: "audio/mpeg",
    durationSeconds: recording.durationSeconds
  };

  // Mureka 等支持真实续写的 provider 需要 demo 音频作为基底；minimax 则以录音重生成
  let demoSong: typeof recordingInput | undefined;
  if (provider.getCapabilities().supportsSongExtend) {
    const parentSongId = String((requestPayload as { parentSongId?: string }).parentSongId ?? "");
    const parentSong = parentSongId ? await repository.getSongById(parentSongId) : null;
    if (parentSong?.objectKey) {
      demoSong = {
        objectKey: parentSong.objectKey,
        signedUrl: await storage.getSignedUrl(parentSong.objectKey, config.storage.signedUrlTtlSeconds),
        mimeType: parentSong.mimeType ?? "audio/mpeg",
        durationSeconds: parentSong.durationSeconds ?? config.limits.demoTargetSeconds
      };
    }
  }

  return provider.createFullSong({
    userId,
    recording: recordingInput,
    demoSong,
    prompt,
    lyrics,
    targetDurationSeconds: config.limits.fullSongMinSeconds
  });
}

async function loop(): Promise<void> {
  for (;;) {
    const processed = await processOneJob();
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
    }
  }
}

await loop();
