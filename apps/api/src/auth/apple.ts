import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { env } from "../env.js";

const keys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
export function createAppleVerifier(audience: string, keySet: JWTVerifyGetKey) {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keySet, { issuer: "https://appleid.apple.com", audience, algorithms: ["RS256"] });
    if (!payload.sub) throw new Error("APPLE_SUBJECT_MISSING");
    return payload;
  };
}
export async function verifyAppleIdentity(token: string) {
  if (!env.APPLE_BUNDLE_ID) throw new Error("APPLE_NOT_CONFIGURED");
  return createAppleVerifier(env.APPLE_BUNDLE_ID, keys)(token);
}
async function clientSecret() {
  if (!env.APPLE_PRIVATE_KEY || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_BUNDLE_ID) throw new Error("APPLE_NOT_CONFIGURED");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID).setSubject(env.APPLE_BUNDLE_ID).setAudience("https://appleid.apple.com")
    .setIssuedAt().setExpirationTime("5m").sign(await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256"));
}
function encryptionKey() {
  if (!env.IDENTITY_ENCRYPTION_KEY || Buffer.from(env.IDENTITY_ENCRYPTION_KEY, "base64").length !== 32) throw new Error("IDENTITY_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return Buffer.from(env.IDENTITY_ENCRYPTION_KEY, "base64");
}
export function encryptAppleToken(token: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const value = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), value]).toString("base64");
}
function decryptAppleToken(value: string) {
  const data = Buffer.from(value, "base64"); const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
export async function exchangeAppleCode(identityToken: string, code: string) {
  const identity = await verifyAppleIdentity(identityToken);
  const response = await fetch("https://appleid.apple.com/auth/token", { method: "POST", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: env.APPLE_BUNDLE_ID!, client_secret: await clientSecret(), grant_type: "authorization_code", code }) });
  if (!response.ok) throw new Error("APPLE_CODE_REJECTED");
  const result = await response.json() as { id_token?: string; refresh_token?: string };
  if (!result.id_token || !result.refresh_token) throw new Error("APPLE_TOKEN_MISSING");
  const verified = await verifyAppleIdentity(result.id_token);
  if (verified.sub !== identity.sub) throw new Error("APPLE_SUBJECT_MISMATCH");
  return { subject: identity.sub!, meta: { encryptedRefreshToken: encryptAppleToken(result.refresh_token), tokenFingerprint: createHash("sha256").update(result.id_token).digest("hex") } };
}
export async function revokeAppleToken(encrypted: string) {
  const response = await fetch("https://appleid.apple.com/auth/revoke", { method: "POST", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: env.APPLE_BUNDLE_ID!, client_secret: await clientSecret(), token: decryptAppleToken(encrypted), token_type_hint: "refresh_token" }) });
  if (!response.ok) throw new Error("APPLE_REVOKE_FAILED");
}
