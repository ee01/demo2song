import type { FastifyInstance } from "fastify";
import { idParamsSchema } from "@demo2song/contract";
import { requireUser } from "../auth/require-user.js";
import { repository } from "../db.js";
import { bindRoute } from "./bind.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  bindRoute(app, "post", "/jobs/:id/notification", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    const { id } = idParamsSchema.parse(request.params);
    const job = await repository.findJobForUser(id, userId);
    if (!job) return reply.code(404).send({ error: "JOB_NOT_FOUND" });
    await repository.updateJob(id, { notificationAccepted: true, notificationError: undefined });
    return reply.send({ ok: true });
  }, { params: idParamsSchema });

  bindRoute(app, "get", "/jobs/:id", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    const { id } = idParamsSchema.parse(request.params);

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
  }, { params: idParamsSchema });
}
