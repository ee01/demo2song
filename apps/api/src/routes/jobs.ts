import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { repository } from "../db.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/jobs/:id", async (request, reply) => {
    const userId = String(request.headers["x-user-id"] ?? "");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!userId) {
      return reply.code(401).send({ error: "MISSING_USER" });
    }

    const job = await repository.findJobForUser(id, userId);
    if (!job) {
      return reply.code(404).send({ error: "JOB_NOT_FOUND" });
    }

    return reply.send({
      id: job.id,
      kind: job.kind,
      status: job.status,
      provider: job.provider,
      songId: job.songId,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  });
}
