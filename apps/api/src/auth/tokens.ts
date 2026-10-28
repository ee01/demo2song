import { createHash, randomBytes } from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { env } from "../env.js";
import { AuthError } from "./errors.js";

export type SessionClient = "mp" | "ios" | "web";

const ACCESS_TTL_SECONDS = 15 * 60;

export function refreshTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccessToken(
  claims: { sub: string; cli: SessionClient; sid: string },
  expiresIn: string | number = "15m"
): Promise<string> {
  return new SignJWT({ cli: claims.cli, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; cli: SessionClient; sid: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const sid = payload.sid;
    const cli = payload.cli;
    if (!payload.sub || (cli !== "mp" && cli !== "ios" && cli !== "web") || typeof sid !== "string" || !sid) {
      throw new AuthError("TOKEN_INVALID");
    }
    return { sub: payload.sub, cli, sid };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof joseErrors.JWTExpired) throw new AuthError("TOKEN_EXPIRED");
    throw new AuthError("TOKEN_INVALID");
  }
}

export const accessTokenTtlSeconds = ACCESS_TTL_SECONDS;
