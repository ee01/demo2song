import type { FastifyReply, FastifyRequest } from "fastify";
import { repository } from "../db.js";
import { env } from "../env.js";
import { AuthError, sendAuthFailure } from "./errors.js";
import { verifyAccessToken } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    authSessionId?: string;
  }
}

export function userIdFromLegacyHeader(header: string | string[] | undefined, enabled: boolean): string | null {
  if (!enabled) return null;
  const value = Array.isArray(header) ? header[0] : header;
  return value ? String(value) : null;
}

function requestPath(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<string | undefined> {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      sendAuthFailure(reply, "MISSING_USER");
      return;
    }
    return userId;
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "TOKEN_INVALID";
    sendAuthFailure(reply, code);
    return;
  }
}

async function authenticate(request: FastifyRequest): Promise<string | null> {
  const path = requestPath(request.url);
  if (!(path === "/v1" || path.startsWith("/v1/"))) {
    return userIdFromLegacyHeader(request.headers["x-user-id"], env.LEGACY_HEADER_AUTH);
  }

  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  const session = await repository.findSessionById(claims.sid);
  if (!session || session.revokedAt || session.userId !== claims.sub) {
    throw new AuthError("SESSION_REVOKED");
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    throw new AuthError("TOKEN_EXPIRED");
  }
  const user = await repository.getUserById(claims.sub);
  if (!user || user.deletedAt || user.mergedInto) {
    throw new AuthError("ACCOUNT_UNAVAILABLE");
  }
  request.authSessionId = session.id;
  return user.id;
}
