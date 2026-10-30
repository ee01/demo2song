// Imported only for the compile-time harness branch. Production builds eliminate this module.
export function fixtureRequest(path: string): unknown {
 const song = { id: "fixture-song", userId: "fixture-user", recordingId: "fixture-record", stage: "demo", status: "ready", provider: "minimax", title: "旧街晚风", lyrics: "[Verse]\n风经过旧街角\n[Chorus]\n让旋律陪你到天明", createdAt: "2026-01-01T12:00:00Z", durationSeconds: 30 };
 if (path.includes("auth/")) return { accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresIn: 900, user: { id: "fixture-user", identities: [] } };
 if (path === "/config/public") return { minRecordingSeconds: 6, maxRecordingSeconds: 60, demoTargetSeconds: 30, enableFullSong: true };
 if (path === "/songs") return { demos: [song], fullSongs: [] };
 if (path.startsWith("/songs/")) return song;
 if (path.startsWith("/jobs/")) return { id: "fixture-job", status: "succeeded", songId: song.id };
 throw new Error(`Missing fixture route: ${path}`);
}
