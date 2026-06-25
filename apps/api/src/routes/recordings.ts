import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { loadValidatedConfig } from "@demo2song/config";
import { repository } from "../db.js";
import { getObjectStorage } from "../storage/index.js";

const config = loadValidatedConfig();

export async function recordingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/recordings", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }

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
    const ext = part.mimetype.includes("wav") ? "wav" : "mp3";
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
