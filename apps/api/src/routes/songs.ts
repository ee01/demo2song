import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadValidatedConfig } from "@demo2song/config";
import type { SongRecord } from "@demo2song/data";
import type { SongBrief, SongPromptInput } from "@demo2song/shared";
import { expandLyrics } from "../services/lyrics.js";
import { assertAndConsumeQuota } from "../services/quota.js";
import { repository } from "../db.js";
import { getObjectStorage } from "../storage/index.js";

const config = loadValidatedConfig();

const promptSchema = z.object({
  style: z.string().min(1).max(120),
  mood: z.string().max(80).optional(),
  language: z.enum(["zh", "en", "ja", "ko", "auto"]).default("zh"),
  vocalGender: z.enum(["female", "male", "mixed", "auto"]).default("auto"),
  description: z.string().max(500).optional(),
  lyricSeed: z.string().max(1000).optional()
});

const promptOverrideSchema = z
  .object({
    style: z.string().min(1).max(120).optional(),
    mood: z.string().max(80).optional(),
    language: z.enum(["zh", "en", "ja", "ko", "auto"]).optional(),
    vocalGender: z.enum(["female", "male", "mixed", "auto"]).optional(),
    description: z.string().max(500).optional(),
    lyricSeed: z.string().max(1000).optional()
  })
  .partial();

const demoJobSchema = z.object({
  recordingId: z.string().min(1),
  prompt: promptSchema
});

const fullJobSchema = z.object({
  prompt: promptOverrideSchema.optional()
});

async function toPlaybackUrl(song: SongRecord): Promise<string | undefined> {
  if (!song.objectKey || song.status !== "ready") {
    return undefined;
  }
  return getObjectStorage().getPublicOrSignedUrl(song.objectKey, config.storage.signedUrlTtlSeconds);
}

async function toBrief(song: SongRecord): Promise<SongBrief> {
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
    createdAt: song.createdAt
  };
}

export async function songRoutes(app: FastifyInstance): Promise<void> {
  app.post("/songs/demo-jobs", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }

    const body = demoJobSchema.parse(request.body);
    const recording = await repository.findRecordingForUser(body.recordingId, userId);
    if (!recording) {
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

    const expandedLyrics = expandLyrics(body.prompt);
    const song = await repository.createSong({
      userId,
      recordingId: recording.id,
      stage: "demo",
      status: "generating",
      provider: config.defaultProvider,
      prompt: body.prompt,
      lyrics: expandedLyrics
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
        expandedLyrics,
        targetDurationSeconds: config.limits.demoTargetSeconds
      }
    });

    return reply.code(201).send({ jobId: job.id, songId: song.id, status: job.status });
  });

  app.post("/songs/:id/full-jobs", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }
    if (!config.features.enableExtendSong) {
      return reply.code(409).send({ error: "FULL_SONG_DISABLED" });
    }

    const parentSong = await repository.findReadyDemoSongForUser(id, userId);
    if (!parentSong || !parentSong.objectKey) {
      return reply.code(404).send({ error: "DEMO_SONG_NOT_READY" });
    }

    const body = fullJobSchema.parse(request.body ?? {});
    const base = parentSong.prompt as SongPromptInput;
    const override = body.prompt ?? {};
    const mergedPrompt: SongPromptInput = {
      style: override.style ?? base.style,
      mood: override.mood ?? base.mood,
      language: override.language ?? base.language,
      vocalGender: override.vocalGender ?? base.vocalGender,
      description: override.description ?? base.description,
      lyricSeed: override.lyricSeed ?? base.lyricSeed
    };

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

    const expandedLyrics = expandLyrics(mergedPrompt);
    const childSong = await repository.createSong({
      userId,
      recordingId: parentSong.recordingId,
      parentSongId: parentSong.id,
      stage: "full",
      status: "generating",
      provider: config.defaultProvider,
      prompt: mergedPrompt,
      lyrics: expandedLyrics
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
  });

  app.get("/songs", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }

    const songs = await repository.listSongsForUser(userId);
    const demoSongs: SongBrief[] = [];
    for (const song of songs.filter((item) => item.stage === "demo")) {
      const fullCount = await repository.countReadyFullForDemo(song.id);
      if (fullCount === 0) {
        demoSongs.push(await toBrief(song));
      }
    }
    const fullSongs = await Promise.all(
      songs.filter((item) => item.stage === "full").map((item) => toBrief(item))
    );

    return reply.send({ demos: demoSongs, fullSongs });
  });

  app.get("/songs/:id", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }

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
  });
}
