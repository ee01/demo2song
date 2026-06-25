import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadValidatedConfig } from "@demo2song/config";
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

const demoJobSchema = z.object({
  recordingId: z.string().min(1),
  prompt: promptSchema
});

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

  app.post("/songs/:id/extend-jobs", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }
    if (!config.features.enableExtendSong) {
      return reply.code(409).send({ error: "EXTEND_DISABLED" });
    }

    const parentSong = await repository.findReadyDemoSongForUser(id, userId);
    if (!parentSong || !parentSong.objectKey) {
      return reply.code(404).send({ error: "DEMO_SONG_NOT_READY" });
    }

    const approximate = config.defaultProvider === "minimax";
    if (approximate && !config.features.enableApproximateMinimaxExtend) {
      return reply.code(409).send({ error: "PROVIDER_EXTEND_UNSUPPORTED", provider: "minimax" });
    }

    try {
      await assertAndConsumeQuota({
        repository,
        userId,
        kind: "extend",
        limit: config.limits.dailyExtendJobsPerUser
      });
    } catch {
      return reply.code(429).send({ error: "DAILY_EXTEND_QUOTA_EXHAUSTED" });
    }

    const childSong = await repository.createSong({
      userId,
      recordingId: parentSong.recordingId,
      parentSongId: parentSong.id,
      stage: "full",
      status: "generating",
      provider: config.defaultProvider,
      prompt: parentSong.prompt,
      lyrics: parentSong.lyrics
    });

    const job = await repository.createSongJob({
      userId,
      recordingId: parentSong.recordingId,
      songId: childSong.id,
      kind: "extend",
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
      capability: approximate ? "approximate" : "supported"
    });
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

    const playbackUrl =
      song.objectKey && song.status === "ready"
        ? await getObjectStorage().getPublicOrSignedUrl(song.objectKey, config.storage.signedUrlTtlSeconds)
        : undefined;

    return reply.send({
      id: song.id,
      userId: song.userId,
      recordingId: song.recordingId,
      stage: song.stage,
      status: song.status,
      title: song.title,
      provider: song.provider,
      objectKey: song.objectKey,
      playbackUrl,
      durationSeconds: song.durationSeconds,
      lyrics: song.lyrics,
      createdAt: song.createdAt
    });
  });
}
