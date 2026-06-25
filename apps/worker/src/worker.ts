import { loadValidatedConfig } from "@demo2song/config";
import type { SongPromptInput } from "@demo2song/shared";
import { repository } from "./db.js";
import { env } from "./env.js";
import { createProvider } from "./providers/index.js";
import { WorkerCosStorage } from "./storage.js";
import { normalizeReferenceAudioToMp3, providerResultToBuffer } from "./audio.js";

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
        ? await createDemo(provider, job.userId, song.recordingId, prompt, song.lyrics ?? "")
        : await createExtension(provider, job.userId, job.requestPayload, prompt, song.lyrics ?? "");

    const audio = await providerResultToBuffer(providerResult);
    const objectKey = `songs/${song.stage}/${job.userId}/${song.id}.mp3`;
    await storage.putObject(objectKey, audio, providerResult.mimeType);

    await repository.updateSong(song.id, {
      status: "ready",
      providerTaskId: providerResult.providerTaskId,
      objectKey,
      mimeType: providerResult.mimeType,
      durationSeconds: providerResult.durationSeconds,
      title: providerResult.title,
      lyrics: providerResult.lyrics ?? song.lyrics,
      providerRaw: providerResult.raw,
      costEstimateUsd: providerResult.costEstimateUsd
    });
    await repository.updateJob(job.id, { status: "succeeded" });
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
  expandedLyrics: string
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
    expandedLyrics,
    targetDurationSeconds: config.limits.demoTargetSeconds
  });
}

async function createExtension(
  provider: ReturnType<typeof createProvider>,
  userId: string,
  requestPayload: unknown,
  prompt: SongPromptInput,
  expandedLyrics: string
) {
  const parentSongId = String((requestPayload as { parentSongId?: string }).parentSongId ?? "");
  const parentSong = await repository.getSongById(parentSongId);
  if (!parentSong) {
    throw new Error(`Parent demo song not found: ${parentSongId}`);
  }
  if (!parentSong.objectKey) {
    throw new Error("Parent demo song has no audio object");
  }
  const normalizedAudio = await normalizeReferenceAudioToMp3(await storage.getObject(parentSong.objectKey));
  return provider.extendSong({
    userId,
    demoSong: {
      objectKey: parentSong.objectKey,
      signedUrl: await storage.getSignedUrl(parentSong.objectKey, config.storage.signedUrlTtlSeconds),
      audioBase64: normalizedAudio.toString("base64"),
      mimeType: parentSong.mimeType ?? "audio/mpeg",
      durationSeconds: parentSong.durationSeconds ?? config.limits.demoTargetSeconds
    },
    prompt,
    expandedLyrics,
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
