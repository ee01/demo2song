import type { Demo2SongRepository, SongJobRecord, SongRecord } from "@demo2song/data";
import type { Demo2SongConfig } from "@demo2song/config";
import type { SongPromptInput } from "@demo2song/shared";
import type { createProvider as ProviderFactory } from "./providers/index.js";
import type { WorkerCosStorage } from "./storage.js";
import { normalizeReferenceAudioToMp3, providerResultToBuffer, markAIGC } from "./audio.js";
export function createJobProcessor(deps: {
 repository: Demo2SongRepository;
 config: Demo2SongConfig;
 storage: Pick<WorkerCosStorage, "getObject" | "putObject" | "getSignedUrl">;
 createProvider: typeof ProviderFactory;
 notifyJob: (job: SongJobRecord, song: SongRecord, status: string) => Promise<void>;
}) {
 const { repository, config, storage, createProvider, notifyJob } = deps;
async function processOneJob(): Promise<boolean> {
  const job = await repository.claimNextQueuedJob();
  if (!job) {
    return false;
  }

  const provider = createProvider(job.provider);

  try {
    const song = job.song;
    await notifyJob(job, song, "running").catch(() => {});
    const prompt = song.prompt as unknown as SongPromptInput;
    const providerResult =
      job.kind === "demo"
        ? await createDemo(provider, job.userId, song.recordingId, prompt, song.lyrics)
        : await createFull(provider, job.userId, song.recordingId, job.requestPayload, prompt, song.lyrics);

    const audio = await providerResultToBuffer(providerResult);
    const objectKey = `songs/${job.userId}/${song.recordingId}/${song.stage}/${song.id}.mp3`;
    await storage.putObject(objectKey, markAIGC(audio), providerResult.mimeType);

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
    await notifyJob(job, { ...song, status: "ready", objectKey, title: providerResult.title ?? song.title }, "succeeded").catch(() => {});
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
    await notifyJob(job, { ...job.song, status: "failed" }, "failed").catch(() => {});
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


return processOneJob;
}
