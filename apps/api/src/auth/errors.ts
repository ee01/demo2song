import type { FastifyReply } from "fastify";

export const AUTH_FAILURES = [
  "MISSING_USER",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "SESSION_REVOKED",
  "SESSION_REPLAYED",
  "ACCOUNT_UNAVAILABLE",
  "WECHAT_LOGIN_FAILED"
] as const;

export type AuthFailureCode = (typeof AUTH_FAILURES)[number];

export class AuthError extends Error {
  constructor(readonly code: Exclude<AuthFailureCode, "MISSING_USER" | "WECHAT_LOGIN_FAILED">) {
    super(code);
  }
}

export function sendAuthFailure(reply: FastifyReply, code: AuthFailureCode) {
  switch (code) {
    case "MISSING_USER":
      return reply.code(401).send({ error: "MISSING_USER" });
    case "TOKEN_EXPIRED":
      return reply.code(401).send({ error: "TOKEN_EXPIRED" });
    case "TOKEN_INVALID":
      return reply.code(401).send({ error: "TOKEN_INVALID" });
    case "SESSION_REVOKED":
      return reply.code(401).send({ error: "SESSION_REVOKED" });
    case "SESSION_REPLAYED":
      return reply.code(401).send({ error: "SESSION_REPLAYED" });
    case "ACCOUNT_UNAVAILABLE":
      return reply.code(401).send({ error: "ACCOUNT_UNAVAILABLE" });
    case "WECHAT_LOGIN_FAILED":
      return reply.code(401).send({ error: "WECHAT_LOGIN_FAILED" });
  }
}
