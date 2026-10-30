import { describe, expect, it } from "vitest";
import { RepositoryConflictError } from "./errors.js";
import { InMemoryRepository } from "./memory.js";

describe("account repository", () => {
  it("creates users and identities, then backfills a union id", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.createUser({ displayName: "阿哼" });
    expect(user.openId).toBeUndefined();

    const identity = await repo.createIdentity({
      userId: user.id,
      provider: "wechat_mp",
      subject: "openid-1"
    });
    expect(await repo.findIdentity("wechat_mp", "openid-1")).toMatchObject({ id: identity.id, userId: user.id });
    expect(await repo.findIdentityByUnionId("union-1")).toBeNull();

    await repo.updateIdentity(identity.id, { unionId: "union-1" });
    expect((await repo.findIdentityByUnionId("union-1"))?.userId).toBe(user.id);
    await expect(
      repo.createIdentity({ userId: user.id, provider: "wechat_mp", subject: "openid-1" })
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const linked = await repo.createIdentity({
      userId: user.id,
      provider: "wechat_app",
      subject: "app-openid",
      unionId: "union-1"
    });
    expect(await repo.listIdentitiesForUser(user.id)).toEqual([
      expect.objectContaining({ id: identity.id }),
      expect.objectContaining({ id: linked.id })
    ]);
  });

  it("rotates session metadata and revokes every session for a user", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.createUser();
    const session = await repo.createSession({
      userId: user.id,
      client: "ios",
      refreshTokenHash: "hash-1",
      expiresAt: "2026-12-01T00:00:00.000Z"
    });
    await repo.updateSession(session.id, { replacedBy: "hash-2" });
    expect((await repo.findSessionByHash("hash-1"))?.replacedBy).toBe("hash-2");
    await repo.revokeSessionsForUser(user.id);
    expect((await repo.findSessionByHash("hash-1"))?.revokedAt).toBeTruthy();
    await repo.revokeSessionsForUser(user.id);
    expect((await repo.findSessionByHash("hash-1"))?.revokedAt).toBeTruthy();
  });

  it("reassigns songs and sums quotas without double counting", async () => {
    const repo = new InMemoryRepository();
    const absorbed = await repo.createUser();
    const survivor = await repo.createUser();
    const recording = await repo.createRecording({
      userId: absorbed.id,
      objectKey: `recordings/${absorbed.id}/take.m4a`,
      mimeType: "audio/mp4",
      durationSeconds: 8
    });
    const song = await repo.createSong({
      userId: absorbed.id,
      recordingId: recording.id,
      stage: "demo",
      status: "generating",
      provider: "minimax",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
    const queued = await repo.createSongJob({
      userId: absorbed.id,
      recordingId: recording.id,
      songId: song.id,
      kind: "demo",
      status: "queued",
      provider: "minimax",
      requestPayload: {}
    });
    await repo.createSongJob({
      userId: absorbed.id,
      songId: song.id,
      kind: "demo",
      status: "succeeded",
      provider: "minimax",
      requestPayload: {}
    });
    expect(await repo.countActiveJobsForUser(absorbed.id)).toBe(1);

    await repo.consumeQuota({ userId: absorbed.id, kind: "demo", limit: 5, dateKey: "2026-10-28" });
    await repo.consumeQuota({ userId: absorbed.id, kind: "demo", limit: 5, dateKey: "2026-10-28" });
    await repo.consumeQuota({ userId: survivor.id, kind: "demo", limit: 5, dateKey: "2026-10-28" });

    const moved = await repo.reassignUserData(absorbed.id, survivor.id);
    expect(moved).toEqual({ recordings: 1, songs: 1, song_jobs: 2, usage_quotas: 1 });
    expect((await repo.getRecordingById(recording.id))?.userId).toBe(survivor.id);
    expect((await repo.getSongById(song.id))?.userId).toBe(survivor.id);
    expect((await repo.findJobForUser(queued.id, survivor.id))?.userId).toBe(survivor.id);
    expect(await repo.countActiveJobsForUser(absorbed.id)).toBe(0);
    expect(await repo.countActiveJobsForUser(survivor.id)).toBe(1);
    expect(recording.objectKey).toContain(absorbed.id);

    await expect(repo.consumeQuota({ userId: survivor.id, kind: "demo", limit: 5, dateKey: "2026-10-28" })).resolves.toBe(
      true
    );
    await expect(repo.consumeQuota({ userId: survivor.id, kind: "demo", limit: 5, dateKey: "2026-10-28" })).resolves.toBe(
      true
    );
    await expect(repo.consumeQuota({ userId: survivor.id, kind: "demo", limit: 5, dateKey: "2026-10-28" })).resolves.toBe(
      false
    );

    const again = await repo.reassignUserData(absorbed.id, survivor.id);
    expect(again).toEqual({ recordings: 0, songs: 0, song_jobs: 0, usage_quotas: 0 });
    await expect(repo.consumeQuota({ userId: survivor.id, kind: "demo", limit: 5, dateKey: "2026-10-28" })).resolves.toBe(
      false
    );
  });

  it("records merge logs and soft-delete markers", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.createUser();
    const log = await repo.createMergeLog({
      survivorUserId: "survivor",
      absorbedUserId: user.id,
      status: "pending"
    });
    await repo.updateMergeLog(log.id, { status: "done", movedCounts: { songs: 2 } });
    await repo.updateUser(user.id, { mergedInto: "survivor", deletedAt: "2026-10-28T00:00:00.000Z" });
    expect(await repo.getUserById(user.id)).toMatchObject({
      mergedInto: "survivor",
      deletedAt: "2026-10-28T00:00:00.000Z"
    });
  });
});

it("keeps deletion cleanup scoped to expired users and removes their metadata", async () => {
  const repo = new InMemoryRepository();
  const expired = await repo.createUser({ deletedAt: "2026-01-01T00:00:00Z" });
  const recent = await repo.createUser({ deletedAt: "2026-10-20T00:00:00Z" });
  const live = await repo.createUser();
  await repo.createRecording({ userId: expired.id, objectKey: "recordings/expired.m4a", mimeType: "audio/mp4", durationSeconds: 7 });
  await repo.createRecording({ userId: live.id, objectKey: "recordings/live.m4a", mimeType: "audio/mp4", durationSeconds: 7 });
  expect((await repo.listDeletedUsersBefore("2026-09-30T00:00:00Z")).map(user => user.id)).toEqual([expired.id]);
  await repo.purgeUserData(expired.id);
  expect(await repo.getUserById(expired.id)).toBeNull();
  expect(await repo.listRecordingsForUser(expired.id)).toHaveLength(0);
  expect(await repo.getUserById(recent.id)).not.toBeNull();
  expect(await repo.listRecordingsForUser(live.id)).toHaveLength(1);
});
