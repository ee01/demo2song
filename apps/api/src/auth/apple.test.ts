import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAppleVerifier } from "./apple.js";
describe("Apple JWKS validation", () => {
 let sign: (claims: {aud?: string; iss?: string; sub?: string; exp?: number}) => Promise<string>;
 let verify: ReturnType<typeof createAppleVerifier>;
 beforeAll(async () => {
  const pair = await generateKeyPair("RS256"); const jwk = await exportJWK(pair.publicKey); jwk.kid = "fixture-key";
  verify = createAppleVerifier("me.eexx.suiheng", createLocalJWKSet({ keys: [jwk] }));
  sign = claims => new SignJWT({}).setProtectedHeader({alg:"RS256",kid:"fixture-key"}).setAudience(claims.aud??"me.eexx.suiheng").setIssuer(claims.iss??"https://appleid.apple.com").setSubject(claims.sub??"apple-user").setExpirationTime(claims.exp??Math.floor(Date.now()/1000)+600).sign(pair.privateKey);
 });
 it("accepts an Apple-issued identity for this bundle", async () => { expect((await verify(await sign({}))).sub).toBe("apple-user"); });
 it("rejects other audiences, issuers, expiry and missing subjects", async () => {
  for (const claims of [{aud:"another.app"},{iss:"https://attacker.test"},{exp:1},{sub:""}]) await expect(verify(await sign(claims))).rejects.toThrow();
 });
 it("rejects an attacker-signed key", async () => { const pair=await generateKeyPair("RS256");const token=await new SignJWT({sub:"apple-user"}).setProtectedHeader({alg:"RS256",kid:"fixture-key"}).setIssuer("https://appleid.apple.com").setAudience("me.eexx.suiheng").setExpirationTime("5m").sign(pair.privateKey); await expect(verify(token)).rejects.toThrow(); });
});
