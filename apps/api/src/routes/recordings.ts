import type { FastifyInstance } from "fastify";
import { uploadUrlSchema } from "@demo2song/contract";
import { nanoid } from "nanoid";
import { loadValidatedConfig } from "@demo2song/config";
import { requireUser } from "../auth/require-user.js";
import { repository } from "../db.js";
import { getObjectStorage } from "../storage/index.js";

const config = loadValidatedConfig();

export async function recordingRoutes(app: FastifyInstance): Promise<void> {
  if (app.contractRoutes) {
    app.post("/recordings/upload-url", async (request, reply) => {
      const userId = await requireUser(request, reply); if (!userId) return;
      const body = uploadUrlSchema.parse(request.body);
      if (body.durationSeconds < config.limits.minRecordingSeconds || body.durationSeconds > config.limits.maxRecordingSeconds) return reply.code(400).send({ error: "INVALID_DURATION" });
      const ext = body.mimeType === "audio/mp4" ? "m4a" : body.mimeType === "audio/wav" ? "wav" : "mp3";
      const key = `recordings/${userId}/${nanoid()}.${ext}`;
      const expiresAt = new Date(Date.now() + 600000).toISOString();
      const putUrl = await getObjectStorage().getUploadUrl(key, body.mimeType, body.byteSize);
      const record = await repository.createRecording({ userId, objectKey: key, mimeType: body.mimeType, durationSeconds: body.durationSeconds, rawMeta: { size: body.byteSize, uploadComplete: false, expiresAt } });
      return { recordingId: record.id, putUrl, headers: { "Content-Type": body.mimeType }, expiresAt };
    });
    app.post("/recordings/:id/complete", async (request, reply) => {
      const userId = await requireUser(request, reply); if (!userId) return;
      const record = await repository.findRecordingForUser((request.params as { id: string }).id, userId);
      if (!record) return reply.code(404).send({ error: "RECORDING_NOT_FOUND" });
      if (record.rawMeta?.uploadComplete === true) return record;
      const head = await getObjectStorage().headObject(record.objectKey);
      if (head.byteSize !== record.rawMeta?.size || head.contentType.split(";")[0] !== record.mimeType) return reply.code(400).send({ error: "UPLOAD_MISMATCH" });
      const rawMeta = { ...record.rawMeta, uploadComplete: true };
      await repository.updateRecording(record.id, { rawMeta });
      return { ...record, rawMeta };
    });
  }
  app.post("/recordings", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;

    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ error: "MISSING_FILE" });
    }

    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const durationSeconds = Number(fields.durationSeconds?.value ?? 0);
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds < config.limits.minRecordingSeconds ||
      durationSeconds > config.limits.maxRecordingSeconds
    ) {
      return reply.code(400).send({
        error: "INVALID_DURATION",
        minSeconds: config.limits.minRecordingSeconds,
        maxSeconds: config.limits.maxRecordingSeconds
      });
    }

    const buffer = await part.toBuffer();
    const ext = part.mimetype.includes("wav") ? "wav" : part.mimetype.includes("mp4") ? "m4a" : "mp3";
    const key = `recordings/${userId}/${Date.now()}-${nanoid(10)}.${ext}`;
    await getObjectStorage().putObject({
      key,
      body: buffer,
      contentType: part.mimetype
    });

    const recording = await repository.createRecording({
      userId,
      objectKey: key,
      mimeType: part.mimetype,
      durationSeconds,
      originalFilename: part.filename,
      rawMeta: {
        size: buffer.byteLength
      }
    });

    return reply.code(201).send({
      id: recording.id,
      userId: recording.userId,
      objectKey: recording.objectKey,
      mimeType: recording.mimeType,
      durationSeconds: recording.durationSeconds,
      originalFilename: recording.originalFilename,
      createdAt: recording.createdAt
    });
  });
}
