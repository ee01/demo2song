import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@demo2song/data";
import { buildApp } from "../app.js";
import { repository } from "../db.js";
import { userIdFromLegacyHeader } from "./require-user.js";
import { resolveWechat } from "./resolve-user.js";
import { refreshTokenHash, signAccessToken } from "./tokens.js";

async function demoSong(repo: InMemoryRepository, userId: string) {
  const recording = await repo.createRecording({
    userId,
    objectKey: `recordings/${userId}/take.mp3`,
    mimeType: "audio/mpeg",
    durationSeconds: 8
  });
  return repo.createSong({
    userId,
    recordingId: recording.id,
    stage: "demo",
    status: "ready",
    provider: "minimax",
    prompt: { style: "pop", language: "zh", vocalGender: "auto" }
  });
}

describe("resolveWechat", () => {
  it("backfills unionid on an existing identity", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.createUser();
    await repo.createIdentity({ userId: user.id, provider: "wechat_mp", subject: "mp-openid" });

    await expect(resolveWechat(repo, "wechat_mp", "mp-openid", "union-1")).resolves.toBe(user.id);
    expect(await repo.findIdentity("wechat_mp", "mp-openid")).toMatchObject({ unionId: "union-1", userId: user.id });
  });

  it("attaches a wechat app identity to the user that already owns the unionid", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.createUser({ openId: "mp-openid" });
    await repo.createIdentity({ userId: user.id, provider: "wechat_mp", subject: "mp-openid", unionId: "union-1" });

    await expect(resolveWechat(repo, "wechat_app", "app-openid", "union-1")).resolves.toBe(user.id);
    expect(await repo.findIdentity("wechat_app", "app-openid")).toMatchObject({ userId: user.id, unionId: "union-1" });
    expect(await repo.findUserByOpenId("app-openid")).toBeNull();
  });

  it("keeps the legacy mini program user when no identity exists yet", async () => {
    const repo = new InMemoryRepository();
    const legacy = await repo.upsertUserByOpenId("mp-openid");
    const song = await demoSong(repo, legacy.id);

    await expect(resolveWechat(repo, "wechat_mp", "mp-openid", "union-1")).resolves.toBe(legacy.id);
    expect(await repo.findIdentity("wechat_mp", "mp-openid")).toMatchObject({ userId: legacy.id, unionId: "union-1" });
    expect((await repo.getSongById(song.id))?.userId).toBe(legacy.id);
  });

  it("creates a user only when the wechat identity has never been seen", async () => {
    const repo = new InMemoryRepository();
    const mpUserId = await resolveWechat(repo, "wechat_mp", "new-mp", "union-new");
    const appUserId = await resolveWechat(repo, "wechat_app", "new-app");

    expect(await repo.findUserByOpenId("new-mp")).toMatchObject({ id: mpUserId });
    expect((await repo.getUserById(appUserId))?.openId).toBeUndefined();
    await expect(resolveWechat(repo, "wechat_mp", "new-mp", "union-new")).resolves.toBe(mpUserId);
    await expect(resolveWechat(repo, "wechat_app", "new-app")).resolves.toBe(appUserId);
  });

  it("signs the iOS app into the existing mini program user and keeps that user's songs", async () => {
    const repo = new InMemoryRepository();
    const legacy = await repo.upsertUserByOpenId("mp-openid");
    await demoSong(repo, legacy.id);

    const mpUserId = await resolveWechat(repo, "wechat_mp", "mp-openid", "union-same");
    const appUserId = await resolveWechat(repo, "wechat_app", "app-openid", "union-same");

    expect(mpUserId).toBe(legacy.id);
    expect(appUserId).toBe(legacy.id);
    expect(await repo.listSongsForUser(legacy.id)).toHaveLength(1);
    expect(await repo.findUserByOpenId("app-openid")).toBeNull();
  });

  it("pulls an earlier iOS-only login back onto the mini program user", async () => {
    const repo = new InMemoryRepository();
    const legacy = await repo.upsertUserByOpenId("mp-openid");
    await demoSong(repo, legacy.id);
    const iosUserId = await resolveWechat(repo, "wechat_app", "app-openid", "union-late");
    await demoSong(repo, iosUserId);

    const mpUserId = await resolveWechat(repo, "wechat_mp", "mp-openid", "union-late");

    expect(iosUserId).not.toBe(legacy.id);
    expect(mpUserId).toBe(legacy.id);
    expect(await repo.listSongsForUser(legacy.id)).toHaveLength(2);
    expect(await repo.listSongsForUser(iosUserId)).toHaveLength(0);
    expect(await repo.getUserById(iosUserId)).toMatchObject({ mergedInto: legacy.id });
    await expect(resolveWechat(repo, "wechat_app", "app-openid", "union-late")).resolves.toBe(legacy.id);
  });
});

describe("auth routes", () => {
  it("rejects legacy user ids when the compatibility flag is off", () => {
    expect(userIdFromLegacyHeader("user-1", false)).toBeNull();
    expect(userIdFromLegacyHeader("user-1", true)).toBe("user-1");
    expect(userIdFromLegacyHeader(undefined, true)).toBeNull();
  });

  it("logs iOS wechat in as the mini program user", async () => {
    const app = await buildApp();
    const existing = await repository.upsertUserByOpenId("dev_singer");
    await repository.createSong({
      userId: existing.id,
      recordingId: (
        await repository.createRecording({
          userId: existing.id,
          objectKey: `recordings/${existing.id}/take.mp3`,
          mimeType: "audio/mpeg",
          durationSeconds: 8
        })
      ).id,
      stage: "demo",
      status: "ready",
      provider: "minimax",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });

    const mpLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat-mp",
      payload: { code: "singer::u-singer" }
    });
    const iosLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat-app",
      payload: { code: "iphone::u-singer" }
    });
    expect(mpLogin.statusCode).toBe(200);
    expect(iosLogin.statusCode).toBe(200);
    expect(mpLogin.json().user.id).toBe(existing.id);
    expect(iosLogin.json().user.id).toBe(existing.id);

    const library = await app.inject({
      method: "GET",
      url: "/v1/songs",
      headers: { authorization: `Bearer ${iosLogin.json().accessToken}` }
    });
    expect(library.statusCode).toBe(200);
    expect(library.json().demos).toHaveLength(1);

    const legacy = await app.inject({
      method: "POST",
      url: "/auth/wechat-login",
      payload: { code: "singer::u-singer" }
    });
    expect(legacy.json()).toEqual({ userId: existing.id });
    await app.close();
  });

  it("rejects expired, tampered, replayed, revoked, and merged sessions", async () => {
    const app = await buildApp();
    const expiredUser = await repository.createUser();
    const expiredSession = await repository.createSession({
      userId: expiredUser.id,
      client: "mp",
      refreshTokenHash: "expired-access",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString()
    });
    const expiredToken = await signAccessToken(
      { sub: expiredUser.id, cli: "mp", sid: expiredSession.id },
      "-10s"
    );
    const expired = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${expiredToken}` }
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toEqual({ error: { code: "TOKEN_EXPIRED" } });

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat-mp",
      payload: { code: "session-user::u-session" }
    });
    const accessToken = login.json().accessToken as string;
    const refreshToken = login.json().refreshToken as string;
    const tampered = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${accessToken.slice(0, -1)}${accessToken.endsWith("a") ? "b" : "a"}` }
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json()).toEqual({ error: { code: "TOKEN_INVALID" } });

    const rotated = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken }
    });
    expect(rotated.statusCode).toBe(200);
    const replayed = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken }
    });
    expect(replayed.statusCode).toBe(401);
    expect(replayed.json()).toEqual({ error: { code: "SESSION_REPLAYED" } });
    const revokedByReplay = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${rotated.json().accessToken}` }
    });
    expect(revokedByReplay.statusCode).toBe(401);
    expect(revokedByReplay.json()).toEqual({ error: { code: "SESSION_REVOKED" } });

    const nextLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat-mp",
      payload: { code: "logout-user::u-logout" }
    });
    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${nextLogin.json().accessToken}` }
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${nextLogin.json().accessToken}` }
    });
    expect(afterLogout.statusCode).toBe(401);
    expect(afterLogout.json()).toEqual({ error: { code: "SESSION_REVOKED" } });

    const mergedLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat-mp",
      payload: { code: "merged-user::u-merged" }
    });
    await repository.updateUser(mergedLogin.json().user.id, { mergedInto: "survivor" });
    const merged = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${mergedLogin.json().accessToken}` }
    });
    expect(merged.statusCode).toBe(401);
    expect(merged.json()).toEqual({ error: { code: "ACCOUNT_UNAVAILABLE" } });

    const staleRefresh = "stale-refresh-token";
    const staleUser = await repository.createUser();
    await repository.createSession({
      userId: staleUser.id,
      client: "ios",
      refreshTokenHash: refreshTokenHash(staleRefresh),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });
    const stale = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: staleRefresh }
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json()).toEqual({ error: { code: "TOKEN_EXPIRED" } });
    await app.close();
  });
});
