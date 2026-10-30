import type { AuthResult, Me } from "@demo2song/contract";
import { authResultSchema } from "@demo2song/contract";
import type { SessionRecord } from "@demo2song/data";
import { repository } from "../db.js";
import { AuthError } from "./errors.js";
import { accessTokenTtlSeconds, newRefreshToken, refreshTokenHash, signAccessToken, type SessionClient } from "./tokens.js";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function readMe(userId: string): Promise<Me> {
  const user = await repository.getUserById(userId);
  if (!user || user.deletedAt || user.mergedInto) throw new AuthError("ACCOUNT_UNAVAILABLE");
  const identities = await repository.listIdentitiesForUser(userId);
  return {
    id: user.id,
    ...(user.displayName ? { displayName: user.displayName } : {}),
    identities: identities.map((identity) => ({
      provider: identity.provider,
      linkedAt: identity.createdAt
    }))
  };
}

async function revokeForward(session: SessionRecord): Promise<void> {
  const revokedAt = new Date().toISOString();
  const seen = new Set<string>();
  let current: SessionRecord | null = session;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (!current.revokedAt) {
      await repository.updateSession(current.id, { revokedAt });
    }
    if (!current.replacedBy) break;
    current = await repository.findSessionByHash(current.replacedBy);
  }
}

export async function issueSession(userId: string, client: SessionClient): Promise<AuthResult> {
  const refreshToken = newRefreshToken();
  const session = await repository.createSession({
    userId,
    client,
    refreshTokenHash: refreshTokenHash(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString()
  });
  const accessToken = await signAccessToken({ sub: userId, cli: client, sid: session.id });
  return authResultSchema.parse({
    accessToken,
    refreshToken,
    expiresIn: accessTokenTtlSeconds,
    user: await readMe(userId)
  });
}

export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const session = await repository.findSessionByHash(refreshTokenHash(refreshToken));
  if (!session) throw new AuthError("TOKEN_INVALID");
  if (session.revokedAt) throw new AuthError("SESSION_REVOKED");
  if (session.replacedBy) {
    await revokeForward(session);
    throw new AuthError("SESSION_REPLAYED");
  }
  if (Date.parse(session.expiresAt) <= Date.now()) throw new AuthError("TOKEN_EXPIRED");

  const nextRefresh = newRefreshToken();
  const nextHash = refreshTokenHash(nextRefresh);
  const created = await repository.createSession({
    userId: session.userId,
    client: session.client,
    refreshTokenHash: nextHash,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString()
  });
  await repository.updateSession(session.id, { replacedBy: nextHash });
  const accessToken = await signAccessToken({ sub: session.userId, cli: session.client, sid: created.id });
  return authResultSchema.parse({
    accessToken,
    refreshToken: nextRefresh,
    expiresIn: accessTokenTtlSeconds,
    user: await readMe(session.userId)
  });
}
