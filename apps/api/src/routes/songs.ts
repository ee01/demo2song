import type { FastifyInstance } from "fastify";
import { loadValidatedConfig } from "@demo2song/config";
import { demoJobSchema, fullDraftSchema, fullJobSchema, idParamsSchema } from "@demo2song/contract";
import type { SongRecord } from "@demo2song/data";
import type { GenerateFullDraftResponse, SongBrief, SongPromptInput } from "@demo2song/shared";
import { generateLyricsDraft } from "../services/minimax-lyrics.js";
import { assertAndConsumeQuota } from "../services/quota.js";
import { requireUser } from "../auth/require-user.js";
import { repository } from "../db.js";
import { getObjectStorage } from "../storage/index.js";
import { bindRoute } from "./bind.js";

const config = loadValidatedConfig();

function mergeSongPrompt(base: SongPromptInput, override: Partial<SongPromptInput> = {}): SongPromptInput {
  return {
    style: override.style ?? base.style,
    mood: override.mood ?? base.mood,
    language: override.language ?? base.language,
    vocalGender: override.vocalGender ?? base.vocalGender,
    description: override.description ?? base.description,
    lyricSeed: override.lyricSeed ?? base.lyricSeed
  };
}

async function toPlaybackUrl(song: SongRecord): Promise<string | undefined> {
  if (!song.objectKey || song.status !== "ready") {
    return undefined;
  }
  return getObjectStorage().getPublicOrSignedUrl(song.objectKey, config.storage.signedUrlTtlSeconds);
}

async function toBrief(song: SongRecord, knownJob?: { id: string } | null): Promise<SongBrief> {
  const job = knownJob === undefined ? await repository.findJobForSongForUser(song.id, song.userId) : knownJob;
  return {
    id: song.id,
    userId: song.userId,
    recordingId: song.recordingId,
    stage: song.stage,
    status: song.status,
    title: song.title,
    provider: song.provider,
    objectKey: song.objectKey,
    playbackUrl: await toPlaybackUrl(song),
    durationSeconds: song.durationSeconds,
    lyrics: song.lyrics,
    createdAt: song.createdAt,
    jobId: job?.id,
    errorCode: song.errorCode,
    errorMessage: song.errorMessage
  };
}

export async function songRoutes(app: FastifyInstance): Promise<void> {
  bindRoute(app, "post", "/songs/demo-jobs", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;

    const body = demoJobSchema.parse(request.body);
    const recording = await repository.findRecordingForUser(body.recordingId, userId);
    if (!recording || recording.rawMeta?.uploadComplete === false) {
      return reply.code(404).send({ error: "RECORDING_NOT_FOUND" });
    }

    try {
      await assertAndConsumeQuota({
        repository,
        userId,
        kind: "demo",
        limit: config.limits.dailyDemoJobsPerUser
      });
    } catch {
      return reply.code(429).send({ error: "DAILY_DEMO_QUOTA_EXHAUSTED" });
    }

    const lyrics = body.prompt.lyricSeed?.trim() || undefined;
    const song = await repository.createSong({
      userId,
      recordingId: recording.id,
      stage: "demo",
      status: "generating",
      provider: config.defaultProvider,
      prompt: body.prompt,
      lyrics
    });

    const job = await repository.createSongJob({
      userId,
      recordingId: recording.id,
      songId: song.id,
      kind: "demo",
      status: "queued",
      provider: config.defaultProvider,
      requestPayload: {
        prompt: body.prompt,
        lyrics,
        targetDurationSeconds: config.limits.demoTargetSeconds
      }
    });

    return reply.code(201).send({ jobId: job.id, songId: song.id, status: job.status });
  }, { body: demoJobSchema });

  bindRoute(app, "post", "/songs/:id/full-draft", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    const { id } = idParamsSchema.parse(request.params);

    const parentSong = await repository.findReadyDemoSongForUser(id, userId);
    if (!parentSong) {
      return reply.code(404).send({ error: "DEMO_SONG_NOT_READY" });
    }

    const body = fullDraftSchema.parse(request.body ?? {});
    const prompt = mergeSongPrompt(parentSong.prompt as SongPromptInput, body.prompt);
    try {
      const generated = await generateLyricsDraft(prompt);
      const payload: GenerateFullDraftResponse = generated;
      return reply.send(payload);
    } catch (error) {
      request.log.warn({ error }, "MiniMax lyrics generation failed");
      return reply.code(502).send({ error: "LYRICS_GENERATION_FAILED" });
    }
  }, { params: idParamsSchema });

  bindRoute(app, "post", "/songs/:id/full-jobs", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    const { id } = idParamsSchema.parse(request.params);
    if (!config.features.enableExtendSong) {
      return reply.code(409).send({ error: "FULL_SONG_DISABLED" });
    }

    const parentSong = await repository.findReadyDemoSongForUser(id, userId);
    if (!parentSong || !parentSong.objectKey) {
      return reply.code(404).send({ error: "DEMO_SONG_NOT_READY" });
    }

    const body = fullJobSchema.parse(request.body ?? {});
    const base = parentSong.prompt as SongPromptInput;
    const mergedPrompt = mergeSongPrompt(base, body.prompt);

    try {
      await assertAndConsumeQuota({
        repository,
        userId,
        kind: "full",
        limit: config.limits.dailyExtendJobsPerUser
      });
    } catch {
      return reply.code(429).send({ error: "DAILY_FULL_QUOTA_EXHAUSTED" });
    }

    const title = body.title?.trim() || parentSong.title || "我的完整歌曲";
    const lyrics = body.lyrics?.trim() || undefined;
    const childSong = await repository.createSong({
      userId,
      recordingId: parentSong.recordingId,
      parentSongId: parentSong.id,
      stage: "full",
      status: "generating",
      provider: config.defaultProvider,
      title,
      prompt: mergedPrompt,
      lyrics
    });

    const job = await repository.createSongJob({
      userId,
      recordingId: parentSong.recordingId,
      songId: childSong.id,
      kind: "full",
      status: "queued",
      provider: config.defaultProvider,
      requestPayload: {
        parentSongId: parentSong.id,
        targetDurationSeconds: config.limits.fullSongMinSeconds
      }
    });

    return reply.code(201).send({
      jobId: job.id,
      songId: childSong.id,
      status: job.status,
      mode: config.defaultProvider === "mureka" ? "extend" : "regenerate"
    });
  }, { params: idParamsSchema });

  app.get("/songs", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;

    const songs = await repository.listSongsForUser(userId);
    const jobs = await repository.listJobsForUser(userId);
    const jobsBySong = new Map(jobs.map((job) => [job.songId, job]));
    const readyParents = new Set(songs.filter((song) => song.stage === "full" && song.status === "ready").map((song) => song.parentSongId));
    const demoSongs = await Promise.all(songs.filter((song) => song.stage === "demo" && !readyParents.has(song.id)).map((song) => toBrief(song, jobsBySong.get(song.id) ?? null)));
    const fullSongs = await Promise.all(songs.filter((song) => song.stage === "full").map((song) => toBrief(song, jobsBySong.get(song.id) ?? null)));

    return reply.send({ demos: demoSongs, fullSongs });
  });

  bindRoute(app, "get", "/songs/:id", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    const { id } = idParamsSchema.parse(request.params);

    const song = await repository.findSongForUser(id, userId);
    if (!song) {
      return reply.code(404).send({ error: "SONG_NOT_FOUND" });
    }

    const brief = await toBrief(song);
    const detail: Record<string, unknown> = {
      ...brief,
      prompt: song.prompt
    };

    if (song.stage === "demo") {
      const recording = await repository.getRecordingById(song.recordingId);
      if (recording) {
        detail.recordingPlaybackUrl = await getObjectStorage().getPublicOrSignedUrl(
          recording.objectKey,
          config.storage.signedUrlTtlSeconds
        );
        detail.recordingDurationSeconds = recording.durationSeconds;
      }
      detail.hasFull = (await repository.countReadyFullForDemo(song.id)) > 0;
    } else if (song.stage === "full" && song.parentSongId) {
      detail.parentDemoId = song.parentSongId;
      const parent = await repository.getSongById(song.parentSongId);
      if (parent && parent.userId === userId) {
        detail.parentDemoPlaybackUrl = await toPlaybackUrl(parent);
      }
      const recording = await repository.getRecordingById(song.recordingId);
      if (recording && recording.userId === userId) {
        detail.recordingPlaybackUrl = await getObjectStorage().getPublicOrSignedUrl(
          recording.objectKey,
          config.storage.signedUrlTtlSeconds
        );
        detail.recordingDurationSeconds = recording.durationSeconds;
      }
    }

    return reply.send(detail);
  }, { params: idParamsSchema });
}
