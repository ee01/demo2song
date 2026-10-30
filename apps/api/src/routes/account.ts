import type { FastifyInstance } from "fastify";
import { appleLoginSchema, linkIdentitySchema, mergeRequestSchema } from "@demo2song/contract";
import { SignJWT, jwtVerify } from "jose";
import { repository as repo } from "../db.js";
import { env } from "../env.js";
import { requireUser } from "../auth/require-user.js";
import { exchangeAppleCode, revokeAppleToken } from "../auth/apple.js";
import { exchangeWechatAppCode } from "../auth/wechat.js";
import { issueSession, readMe } from "../auth/session.js";
import { bindRoute } from "./bind.js";

const secret = () => new TextEncoder().encode(env.JWT_SECRET);
async function counts(userId: string) {
  return { songCount: (await repo.listSongsForUser(userId)).length, recordingCount: (await repo.listRecordingsForUser(userId)).length };
}
export async function accountRoutes(app: FastifyInstance) {
  // Account mutations are available only through the versioned API.
  if (!app.contractRoutes) return;
  bindRoute(app, "post", "/auth/apple", async (req, reply) => {
    const body = appleLoginSchema.parse(req.body);
    try {
      const apple = await exchangeAppleCode(body.identityToken, body.authorizationCode);
      let identity = await repo.findIdentity("apple", apple.subject);
      if (!identity) {
        const user = await repo.createUser(body.fullName ? { displayName: body.fullName } : {});
        identity = await repo.createIdentity({ userId: user.id, provider: "apple", ...apple });
      } else await repo.updateIdentity(identity.id, { meta: apple.meta });
      return await issueSession(identity.userId, "ios");
    } catch { return reply.code(401).send({ error: "APPLE_LOGIN_FAILED" }); }
  }, { body: appleLoginSchema });

  bindRoute(app, "post", "/me/identities", async (req, reply) => {
    const current = await requireUser(req, reply); if (!current) return;
    const body = linkIdentitySchema.parse(req.body);
    let claim: { provider: "apple" | "wechat_app"; subject: string; unionId?: string; meta?: Record<string, unknown> };
    try {
      if (body.provider === "apple") claim = { provider: "apple", ...await exchangeAppleCode(body.identityToken, body.authorizationCode) };
      else { const wx = await exchangeWechatAppCode(body.code); claim = { provider: "wechat_app", subject: wx.openid, ...(wx.unionid ? { unionId: wx.unionid } : {}) }; }
    } catch { return reply.code(401).send({ error: "IDENTITY_VERIFICATION_FAILED" }); }
    const direct = await repo.findIdentity(claim.provider, claim.subject);
    const existing = direct ?? (claim.unionId ? await repo.findIdentityByUnionId(claim.unionId) : null);
    if (!existing || existing.userId === current) {
      if (direct) await repo.updateIdentity(direct.id, claim); else await repo.createIdentity({ userId: current, ...claim });
      return await readMe(current);
    }
    const survivor = claim.provider === "wechat_app" ? existing.userId : current;
    const absorbed = survivor === current ? existing.userId : current;
    const target = await repo.getUserById(survivor);
    if (!target || target.deletedAt || target.mergedInto) return reply.code(409).send({ error: "ACCOUNT_UNAVAILABLE" });
    // Verified credentials are carried in a signed, short-lived token. Never include refresh secrets.
    const mergeToken = await new SignJWT({ purpose: "account-merge", current, absorbed, survivor, claim: { ...claim, meta: undefined } })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secret());
    return reply.code(409).send({ error: { code: "MERGE_REQUIRED", params: { mergeToken, target: { ...await counts(survivor), lastActiveAt: target.updatedAt }, current: await counts(absorbed) } } });
  }, { body: linkIdentitySchema });

  bindRoute(app, "post", "/me/merge", async (req, reply) => {
    const current = await requireUser(req, reply); if (!current) return;
    const { mergeToken } = mergeRequestSchema.parse(req.body);
    let claims;
    try { claims = (await jwtVerify(mergeToken, secret(), { algorithms: ["HS256"] })).payload; }
    catch { return reply.code(401).send({ error: "TOKEN_INVALID" }); }
    const { absorbed, survivor, claim } = claims as { absorbed: string; survivor: string; claim: { provider: "apple" | "wechat_app"; subject: string; unionId?: string } };
    if (claims.purpose !== "account-merge" || claims.current !== current || !absorbed || !survivor || !claim?.subject) return reply.code(401).send({ error: "TOKEN_INVALID" });
    const sourceUser = await repo.getUserById(absorbed); const targetUser = await repo.getUserById(survivor);
    if (!sourceUser || sourceUser.deletedAt || (sourceUser.mergedInto && sourceUser.mergedInto !== survivor) || !targetUser || targetUser.deletedAt || targetUser.mergedInto) return reply.code(409).send({ error: "ACCOUNT_UNAVAILABLE" });
    const direct = await repo.findIdentity(claim.provider, claim.subject);
    const owner = direct ?? (claim.unionId ? await repo.findIdentityByUnionId(claim.unionId) : null);
    if (owner && owner.userId !== absorbed && owner.userId !== survivor) return reply.code(409).send({ error: "IDENTITY_VERIFICATION_FAILED" });
    if (await repo.countActiveJobsForUser(absorbed)) return reply.code(409).send({ error: "JOB_IN_PROGRESS" });
    const log = await repo.createMergeLog({ absorbedUserId: absorbed, survivorUserId: survivor, status: "pending" });
    try {
      const movedCounts = await repo.reassignUserData(absorbed, survivor);
      for (const identity of await repo.listIdentitiesForUser(absorbed)) await repo.updateIdentity(identity.id, { userId: survivor });
      const identity = await repo.findIdentity(claim.provider, claim.subject);
      if (!identity) await repo.createIdentity({ userId: survivor, ...claim });
      else if (identity.userId !== survivor) throw new Error("IDENTITY_CHANGED");
      await repo.revokeSessionsForUser(absorbed);
      await repo.updateUser(absorbed, { mergedInto: survivor });
      await repo.updateMergeLog(log.id, { status: "done", movedCounts });
      return await issueSession(survivor, "ios");
    } catch {
      await repo.updateMergeLog(log.id, { status: "failed", error: "MERGE_FAILED" });
      return reply.code(503).send({ error: "MERGE_FAILED" });
    }
  }, { body: mergeRequestSchema });

  app.delete("/me", async (req, reply) => {
    const userId = await requireUser(req, reply); if (!userId) return;
    if (await repo.countActiveJobsForUser(userId)) return reply.code(409).send({ error: "JOB_IN_PROGRESS" });
    for (const identity of await repo.listIdentitiesForUser(userId)) {
      const token = identity.meta?.encryptedRefreshToken;
      if (identity.provider === "apple" && typeof token === "string") {
        try { await revokeAppleToken(token); } catch { return reply.code(503).send({ error: "APPLE_REVOKE_FAILED" }); }
      }
    }
    await repo.updateUser(userId, { deletedAt: new Date().toISOString(), openId: `deleted:${userId}` });
    await repo.revokeSessionsForUser(userId);
    await repo.deleteIdentitiesForUser(userId);
    return reply.code(204).send();
  });
}
