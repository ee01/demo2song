import type { FastifyInstance } from "fastify";
import { refreshRequestSchema, wechatCodeSchema } from "@demo2song/contract";
import { repository } from "../db.js";
import { requireUser } from "../auth/require-user.js";
import { resolveWechat } from "../auth/resolve-user.js";
import { issueSession, readMe, refreshSession } from "../auth/session.js";
import { AuthError, sendAuthFailure } from "../auth/errors.js";
import { exchangeWechatAppCode, exchangeWechatMpCode } from "../auth/wechat.js";
import { bindRoute } from "./bind.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  bindRoute(app, "post", "/auth/wechat-login", async (request, reply) => {
    const body = wechatCodeSchema.parse(request.body);
    try {
      const identity = await exchangeWechatMpCode(body.code);
      const userId = await resolveWechat(repository, "wechat_mp", identity.openid, identity.unionid);
      if (identity.sessionKey) await repository.updateUser(userId, { sessionKey: identity.sessionKey });
      return reply.send({ userId });
    } catch (error) {
      request.log.warn({ err: error }, "wechat login failed");
      return sendAuthFailure(reply, "WECHAT_LOGIN_FAILED");
    }
  }, { body: wechatCodeSchema });

  bindRoute(app, "post", "/auth/wechat-mp", async (request, reply) => {
    const body = wechatCodeSchema.parse(request.body);
    try {
      const identity = await exchangeWechatMpCode(body.code);
      const userId = await resolveWechat(repository, "wechat_mp", identity.openid, identity.unionid);
      if (identity.sessionKey) await repository.updateUser(userId, { sessionKey: identity.sessionKey });
      return reply.send(await issueSession(userId, "mp"));
    } catch (error) {
      request.log.warn({ err: error }, "wechat mp login failed");
      return sendAuthFailure(reply, "WECHAT_LOGIN_FAILED");
    }
  }, { body: wechatCodeSchema });

  bindRoute(app, "post", "/auth/wechat-app", async (request, reply) => {
    const body = wechatCodeSchema.parse(request.body);
    try {
      const identity = await exchangeWechatAppCode(body.code);
      const userId = await resolveWechat(repository, "wechat_app", identity.openid, identity.unionid);
      return reply.send(await issueSession(userId, "ios"));
    } catch (error) {
      request.log.warn({ err: error }, "wechat app login failed");
      return sendAuthFailure(reply, "WECHAT_LOGIN_FAILED");
    }
  }, { body: wechatCodeSchema });

  bindRoute(app, "post", "/auth/refresh", async (request, reply) => {
    const body = refreshRequestSchema.parse(request.body);
    try {
      return reply.send(await refreshSession(body.refreshToken));
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "TOKEN_INVALID";
      return sendAuthFailure(reply, code);
    }
  }, { body: refreshRequestSchema });

  bindRoute(app, "post", "/auth/logout", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    if (request.authSessionId) {
      await repository.updateSession(request.authSessionId, { revokedAt: new Date().toISOString() });
    }
    return reply.code(204).send();
  });

  bindRoute(app, "get", "/me", async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) return;
    return reply.send(await readMe(userId));
  });
}
