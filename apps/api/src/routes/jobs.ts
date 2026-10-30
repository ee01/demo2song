import type { FastifyInstance } from "fastify";
import { idParamsSchema, subscriptionSchema, deviceSchema } from "@demo2song/contract";
import { requireUser } from "../auth/require-user.js";
import { repository } from "../db.js";
import { bindRoute } from "./bind.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  if (app.contractRoutes) {
    app.post("/me/devices", async (request, reply) => {
      const userId = await requireUser(request, reply); if (!userId) return;
      const body = deviceSchema.parse(request.body);
      const user = await repository.getUserById(userId);
      const devices = [...(user?.devices ?? []).filter((device) => device.apnsToken !== body.apnsToken), body].slice(-10);
      await repository.updateUser(userId, { devices }); return { ok: true };
    });
    app.post("/jobs/:id/subscriptions", async (request, reply) => {
      const userId = await requireUser(request, reply); if (!userId) return;
      const { id } = idParamsSchema.parse(request.params);
      const job = await repository.findJobForUser(id, userId); if (!job) return reply.code(404).send({ error: "JOB_NOT_FOUND" });
      const body = subscriptionSchema.parse(request.body);
      const subscriptions = [...(job.subscriptions ?? []).filter((item) => item.channel !== body.channel || item.token !== body.token), body];
      await repository.updateJob(id, { subscriptions, ...(body.channel === "wechat_subscribe" ? { notificationAccepted: true } : {}) });
      return { ok: true };
    });
    app.get("/jobs/:id/events", async (request, reply) => {
      const userId = await requireUser(request, reply); if (!userId) return;
      const { id } = idParamsSchema.parse(request.params);
      const job = await repository.findJobForUser(id, userId); if (!job) return reply.code(404).send({ error: "JOB_NOT_FOUND" });
      reply.hijack();
      reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let heartbeat = Date.now(); let last = "";
      const stop = () => { stopped = true; if (timer) clearTimeout(timer); };
      reply.raw.on("close", stop);
      const tick = async () => {
        try {
          // Recheck session/account during long-lived connections.
          const user = await repository.getUserById(userId);
          const session = request.authSessionId ? await repository.findSessionById(request.authSessionId) : null;
          if (!user || user.deletedAt || user.mergedInto || session?.revokedAt || (session && Date.parse(session.expiresAt) <= Date.now())) { reply.raw.end(); return; }
          const value = await repository.findJobForUser(id, userId);
          if (!value || stopped) { reply.raw.end(); return; }
          const payload = JSON.stringify({ status: value.status, songId: value.songId, error: value.errorCode });
          if (payload !== last) { reply.raw.write(`event: status\ndata: ${payload}\n\n`); last = payload; }
          if (value.status === "succeeded" || value.status === "failed") { reply.raw.end(); return; }
          if (Date.now() - heartbeat >= 15000) { reply.raw.write(": heartbeat\n\n"); heartbeat = Date.now(); }
          if (!stopped) timer = setTimeout(tick, 2000);
        } catch { reply.raw.end(); }
      };
      await tick();
    });
  }
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
