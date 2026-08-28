import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./memory.js";

describe("InMemoryRepository", () => {
  it("upserts users and consumes quotas", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.upsertUserByOpenId("openid-a", "session-a");
    const sameUser = await repo.upsertUserByOpenId("openid-a", "session-b");

    expect(sameUser.id).toBe(user.id);
    expect(sameUser.sessionKey).toBe("session-b");
    await expect(repo.consumeQuota({ userId: user.id, kind: "demo", limit: 1 })).resolves.toBe(true);
    await expect(repo.consumeQuota({ userId: user.id, kind: "demo", limit: 1 })).resolves.toBe(false);
  });

  it("does not consume quota when the configured limit is zero", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.upsertUserByOpenId("openid-a");

    await expect(repo.consumeQuota({ userId: user.id, kind: "demo", limit: 0 })).resolves.toBe(true);
    await expect(repo.consumeQuota({ userId: user.id, kind: "demo", limit: 0 })).resolves.toBe(true);
  });

  it("claims queued jobs with their songs", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.upsertUserByOpenId("openid-a");
    const recording = await repo.createRecording({
      userId: user.id,
      objectKey: "recordings/a.mp3",
      mimeType: "audio/mpeg",
      durationSeconds: 10
    });
    const song = await repo.createSong({
      userId: user.id,
      recordingId: recording.id,
      stage: "demo",
      status: "generating",
      provider: "minimax",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
    const job = await repo.createSongJob({
      userId: user.id,
      recordingId: recording.id,
      songId: song.id,
      kind: "demo",
      status: "queued",
      provider: "minimax",
      requestPayload: {}
    });

    const claimed = await repo.claimNextQueuedJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.song.id).toBe(song.id);
  });

  it("lists songs for a user and counts ready full songs for a demo", async () => {
    const repo = new InMemoryRepository();
    const user = await repo.upsertUserByOpenId("openid-a");
    const otherUser = await repo.upsertUserByOpenId("openid-b");
    const recording = await repo.createRecording({
      userId: user.id,
      objectKey: "recordings/a.mp3",
      mimeType: "audio/mpeg",
      durationSeconds: 10
    });
    const demo = await repo.createSong({
      userId: user.id,
      recordingId: recording.id,
      stage: "demo",
      status: "ready",
      provider: "minimax",
      objectKey: "songs/user/recording/demo/demo.mp3",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
    const readyFull = await repo.createSong({
      userId: user.id,
      recordingId: recording.id,
      parentSongId: demo.id,
      stage: "full",
      status: "ready",
      provider: "minimax",
      objectKey: "songs/user/recording/full/full.mp3",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
    await repo.createSong({
      userId: user.id,
      recordingId: recording.id,
      parentSongId: demo.id,
      stage: "full",
      status: "generating",
      provider: "minimax",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
    await repo.createSong({
      userId: otherUser.id,
      recordingId: recording.id,
      parentSongId: demo.id,
      stage: "full",
      status: "ready",
      provider: "minimax",
      objectKey: "songs/other/recording/full/full.mp3",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });

    await expect(repo.listSongsForUser(user.id)).resolves.toHaveLength(3);
    await expect(repo.listFullSongsForDemo(demo.id, user.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: readyFull.id })])
    );
    await expect(repo.countReadyFullForDemo(demo.id)).resolves.toBe(2);
  });
});
