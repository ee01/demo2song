import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SongBrief } from "@demo2song/shared";
import { buildApp } from "./app.js";
import { repository } from "./db.js";

vi.mock("./storage/index.js", () => ({
  getObjectStorage: () => ({
    putObject: async ({ key }: { key: string }) => ({ key }),
    getSignedUrl: async (key: string) => `https://storage.test/${key}?signed=1`,
    getPublicOrSignedUrl: async (key: string) => `https://storage.test/${key}`
  })
}));

vi.mock("./services/minimax-lyrics.js", () => ({
  generateLyricsDraft: async () => ({
    title: "旧街晚风",
    lyrics: "[Verse]\n风吹过旧街角\n[Chorus]\n我还记得那盏灯",
    styleTags: "Mandopop, Nostalgic"
  })
}));

describe("api app", () => {
  it("returns health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("creates demo and full jobs, lists the library, and exposes share playback", async () => {
    const app = await buildApp();
    const userId = `user-${randomUUID()}`;
    const prompt = {
      style: "warm indie pop",
      mood: "bright",
      language: "zh",
      vocalGender: "auto",
      description: "夏天傍晚的路"
    };
    const recording = await repository.createRecording({
      userId,
      objectKey: `recordings/${userId}/take.mp3`,
      mimeType: "audio/mpeg",
      durationSeconds: 12
    });

    const demoJobResponse = await app.inject({
      method: "POST",
      url: "/songs/demo-jobs",
      headers: { "x-user-id": userId },
      payload: { recordingId: recording.id, prompt }
    });
    expect(demoJobResponse.statusCode).toBe(201);
    const demoJob = demoJobResponse.json<{ jobId: string; songId: string; status: string }>();
    expect(demoJob.status).toBe("queued");
    const notificationResponse = await app.inject({
      method: "POST",
      url: `/jobs/${demoJob.jobId}/notification`,
      headers: { "x-user-id": userId }
    });
    expect(notificationResponse.statusCode).toBe(200);
    expect((await repository.findJobForUser(demoJob.jobId, userId))?.notificationAccepted).toBe(true);

    await repository.updateSong(demoJob.songId, {
      status: "ready",
      objectKey: `songs/${userId}/${recording.id}/demo/${demoJob.songId}.mp3`,
      durationSeconds: 12,
      title: "Demo"
    });

    const fullDraftResponse = await app.inject({
      method: "POST",
      url: `/songs/${demoJob.songId}/full-draft`,
      headers: { "x-user-id": userId },
      payload: { prompt: { mood: "nostalgic" } }
    });
    expect(fullDraftResponse.statusCode).toBe(200);
    expect(fullDraftResponse.json()).toEqual({
      title: "旧街晚风",
      lyrics: "[Verse]\n风吹过旧街角\n[Chorus]\n我还记得那盏灯",
      styleTags: "Mandopop, Nostalgic"
    });

    const fullJobResponse = await app.inject({
      method: "POST",
      url: `/songs/${demoJob.songId}/full-jobs`,
      headers: { "x-user-id": userId },
      payload: {
        prompt: {
          mood: "nostalgic",
          lyricSeed: "风吹过旧街角"
        },
        title: "用户修改后的歌名",
        lyrics: "[Verse]\n用户修改后的歌词\n[Chorus]\n不会被覆盖"
      }
    });
    expect(fullJobResponse.statusCode).toBe(201);
    const fullJob = fullJobResponse.json<{ jobId: string; songId: string; status: string; mode: string }>();
    expect(fullJob.status).toBe("queued");
    expect(fullJob.mode).toBe("regenerate");

    const fullSong = await repository.getSongById(fullJob.songId);
    expect(fullSong?.stage).toBe("full");
    expect(fullSong?.parentSongId).toBe(demoJob.songId);
    expect((fullSong?.prompt as typeof prompt).style).toBe(prompt.style);
    expect((fullSong?.prompt as { mood?: string }).mood).toBe("nostalgic");
    expect(fullSong?.title).toBe("用户修改后的歌名");
    expect(fullSong?.lyrics).toBe("[Verse]\n用户修改后的歌词\n[Chorus]\n不会被覆盖");

    await repository.updateSong(fullJob.songId, {
      status: "ready",
      objectKey: `songs/${userId}/${recording.id}/full/${fullJob.songId}.mp3`,
      durationSeconds: 150,
      title: "Full Song"
    });

    const libraryResponse = await app.inject({
      method: "GET",
      url: "/songs",
      headers: { "x-user-id": userId }
    });
    expect(libraryResponse.statusCode).toBe(200);
    const library = libraryResponse.json<{ demos: SongBrief[]; fullSongs: SongBrief[] }>();
    expect(library.demos).toEqual([]);
    expect(library.fullSongs).toHaveLength(1);
    expect(library.fullSongs[0].id).toBe(fullJob.songId);
    expect(library.fullSongs[0].jobId).toBe(fullJob.jobId);

    const demoDetailResponse = await app.inject({
      method: "GET",
      url: `/songs/${demoJob.songId}`,
      headers: { "x-user-id": userId }
    });
    expect(demoDetailResponse.statusCode).toBe(200);
    expect(demoDetailResponse.json()).toMatchObject({
      id: demoJob.songId,
      stage: "demo",
      hasFull: true,
      recordingPlaybackUrl: `https://storage.test/${recording.objectKey}`
    });

    const fullDetailResponse = await app.inject({
      method: "GET",
      url: `/songs/${fullJob.songId}`,
      headers: { "x-user-id": userId }
    });
    expect(fullDetailResponse.statusCode).toBe(200);
    expect(fullDetailResponse.json()).toMatchObject({
      id: fullJob.songId,
      stage: "full",
      parentDemoId: demoJob.songId,
      parentDemoPlaybackUrl: `https://storage.test/songs/${userId}/${recording.id}/demo/${demoJob.songId}.mp3`,
      recordingPlaybackUrl: `https://storage.test/${recording.objectKey}`,
      recordingDurationSeconds: 12
    });

    const publicResponse = await app.inject({ method: "GET", url: `/public/songs/${fullJob.songId}` });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toMatchObject({
      id: fullJob.songId,
      stage: "full",
      playbackUrl: `https://storage.test/songs/${userId}/${recording.id}/full/${fullJob.songId}.mp3`
    });

    await app.close();
  });

  it("mirrors routes under /v1 and wraps errors without changing legacy responses", async () => {
    const app = await buildApp();
    const userId = `user-${randomUUID()}`;
    const legacyMissing = await app.inject({ method: "GET", url: "/songs" });
    expect(legacyMissing.statusCode).toBe(401);
    expect(legacyMissing.json()).toEqual({ error: "MISSING_USER" });

    const v1Missing = await app.inject({ method: "GET", url: "/v1/songs" });
    expect(v1Missing.statusCode).toBe(401);
    expect(v1Missing.json()).toEqual({ error: { code: "MISSING_USER" } });

    const recording = await repository.createRecording({
      userId,
      objectKey: `recordings/${userId}/take.mp3`,
      mimeType: "audio/mpeg",
      durationSeconds: 12
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/songs/demo-jobs",
      headers: { "x-user-id": userId },
      payload: {
        recordingId: recording.id,
        prompt: { style: "warm indie pop", language: "zh", vocalGender: "auto" }
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: "queued", songId: expect.any(String) });

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/songs/demo-jobs",
      headers: { "x-user-id": userId },
      payload: {}
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const legacyInvalid = await app.inject({
      method: "POST",
      url: "/songs/demo-jobs",
      headers: { "x-user-id": userId },
      payload: {}
    });
    expect(legacyInvalid.json().error).toBeTypeOf("string");

    const v1Config = await app.inject({ method: "GET", url: "/v1/config/public" });
    const legacyConfig = await app.inject({ method: "GET", url: "/config/public" });
    expect(v1Config.statusCode).toBe(200);
    expect(v1Config.json()).toEqual(legacyConfig.json());

    const missingSong = await app.inject({
      method: "GET",
      url: "/v1/songs/missing",
      headers: { "x-user-id": userId }
    });
    expect(missingSong.statusCode).toBe(404);
    expect(missingSong.json()).toEqual({ error: { code: "SONG_NOT_FOUND" } });
    await app.close();
  });
});
