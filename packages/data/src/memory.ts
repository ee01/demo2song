import type {
  CreateRecordingInput,
  CreateSongInput,
  CreateSongJobInput,
  Demo2SongRepository,
  ProviderEventRecord,
  RecordingRecord,
  SongJobRecord,
  SongRecord,
  UsageQuotaRecord,
  UserRecord
} from "./types.js";
import { createId, nowIso, todayKey } from "./utils.js";

type CollectionName = "users" | "recordings" | "songs" | "song_jobs" | "usage_quotas" | "provider_events";

export class InMemoryRepository implements Demo2SongRepository {
  private readonly data: Record<CollectionName, Map<string, any>> = {
    users: new Map(),
    recordings: new Map(),
    songs: new Map(),
    song_jobs: new Map(),
    usage_quotas: new Map(),
    provider_events: new Map()
  };

  async upsertUserByOpenId(openId: string, sessionKey?: string): Promise<UserRecord> {
    const existing = [...this.data.users.values()].find((user: UserRecord) => user.openId === openId);
    if (existing) {
      const updated = { ...existing, sessionKey, updatedAt: nowIso() };
      this.data.users.set(updated.id, updated);
      return updated;
    }
    return this.insert("users", { openId, sessionKey });
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return (this.data.users.get(id) as UserRecord | undefined) ?? null;
  }

  async createRecording(input: CreateRecordingInput): Promise<RecordingRecord> {
    return this.insert("recordings", input);
  }

  async findRecordingForUser(id: string, userId: string): Promise<RecordingRecord | null> {
    const record = this.data.recordings.get(id) as RecordingRecord | undefined;
    return record?.userId === userId ? record : null;
  }

  async getRecordingById(id: string): Promise<RecordingRecord | null> {
    return (this.data.recordings.get(id) as RecordingRecord | undefined) ?? null;
  }

  async createSong(input: CreateSongInput): Promise<SongRecord> {
    return this.insert("songs", input);
  }

  async findSongForUser(id: string, userId: string): Promise<SongRecord | null> {
    const song = this.data.songs.get(id) as SongRecord | undefined;
    return song?.userId === userId ? song : null;
  }

  async findReadyDemoSongForUser(id: string, userId: string): Promise<SongRecord | null> {
    const song = await this.findSongForUser(id, userId);
    return song?.status === "ready" && song.stage === "demo" ? song : null;
  }

  async getSongById(id: string): Promise<SongRecord | null> {
    return (this.data.songs.get(id) as SongRecord | undefined) ?? null;
  }

  async listSongsForUser(userId: string): Promise<SongRecord[]> {
    return [...this.data.songs.values()]
      .filter((song: SongRecord) => song.userId === userId)
      .sort((a: SongRecord, b: SongRecord) => b.createdAt.localeCompare(a.createdAt));
  }

  async listFullSongsForDemo(demoId: string, userId: string): Promise<SongRecord[]> {
    return [...this.data.songs.values()]
      .filter(
        (song: SongRecord) =>
          song.userId === userId && song.parentSongId === demoId && song.stage === "full"
      )
      .sort((a: SongRecord, b: SongRecord) => b.createdAt.localeCompare(a.createdAt));
  }

  async countReadyFullForDemo(demoId: string): Promise<number> {
    return [...this.data.songs.values()].filter(
      (song: SongRecord) => song.parentSongId === demoId && song.stage === "full" && song.status === "ready"
    ).length;
  }

  async updateSong(id: string, patch: Partial<SongRecord>): Promise<void> {
    this.update("songs", id, patch);
  }

  async createSongJob(input: CreateSongJobInput): Promise<SongJobRecord> {
    return this.insert("song_jobs", input);
  }

  async findJobForUser(id: string, userId: string): Promise<SongJobRecord | null> {
    const job = this.data.song_jobs.get(id) as SongJobRecord | undefined;
    return job?.userId === userId ? job : null;
  }

  async findJobForSongForUser(songId: string, userId: string): Promise<SongJobRecord | null> {
    return ([...this.data.song_jobs.values()] as SongJobRecord[]).find(
      (job) => job.songId === songId && job.userId === userId
    ) ?? null;
  }

  async claimNextQueuedJob(): Promise<(SongJobRecord & { song: SongRecord }) | null> {
    const jobs = [...this.data.song_jobs.values()]
      .filter((job: SongJobRecord) => job.status === "queued")
      .sort((a: SongJobRecord, b: SongJobRecord) => a.createdAt.localeCompare(b.createdAt));
    const job = jobs[0] as SongJobRecord | undefined;
    if (!job?.songId) {
      return null;
    }
    const song = await this.getSongById(job.songId);
    if (!song) {
      return null;
    }
    await this.updateJob(job.id, { status: "running", lockedAt: nowIso() });
    return { ...(await this.findJobForUser(job.id, job.userId))!, song };
  }

  async updateJob(id: string, patch: Partial<SongJobRecord>): Promise<void> {
    this.update("song_jobs", id, patch);
  }

  async createProviderEvent(input: Omit<ProviderEventRecord, keyof import("./types.js").BaseRecord>): Promise<ProviderEventRecord> {
    return this.insert("provider_events", input);
  }

  async consumeQuota(input: { userId: string; kind: SongJobRecord["kind"]; limit: number; dateKey?: string }): Promise<boolean> {
    if (input.limit <= 0) {
      return true;
    }
    const dateKey = input.dateKey ?? todayKey();
    const existing = [...this.data.usage_quotas.values()].find(
      (quota: UsageQuotaRecord) =>
        quota.userId === input.userId && quota.kind === input.kind && quota.dateKey === dateKey
    ) as UsageQuotaRecord | undefined;

    if (!existing) {
      await this.insert("usage_quotas", { userId: input.userId, kind: input.kind, dateKey, used: 1 });
      return true;
    }
    if (existing.used >= input.limit) {
      return false;
    }
    this.update("usage_quotas", existing.id, { used: existing.used + 1 });
    return true;
  }

  async refundQuota(input: { userId: string; kind: SongJobRecord["kind"]; dateKey?: string }): Promise<void> {
    const dateKey = input.dateKey ?? todayKey();
    const existing = [...this.data.usage_quotas.values()].find(
      (quota: UsageQuotaRecord) =>
        quota.userId === input.userId && quota.kind === input.kind && quota.dateKey === dateKey
    ) as UsageQuotaRecord | undefined;
    if (existing && existing.used > 0) {
      this.update("usage_quotas", existing.id, { used: existing.used - 1 });
    }
  }

  private async insert<T extends { id: string; createdAt: string; updatedAt: string }>(
    collection: CollectionName,
    input: Omit<T, "id" | "createdAt" | "updatedAt">
  ): Promise<T> {
    const timestamp = nowIso();
    const record = {
      id: createId(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    } as T;
    this.data[collection].set(record.id, record);
    return record;
  }

  private update(collection: CollectionName, id: string, patch: Record<string, unknown>): void {
    const existing = this.data[collection].get(id);
    if (!existing) {
      throw new Error(`${collection} record not found: ${id}`);
    }
    this.data[collection].set(id, {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    });
  }
}
