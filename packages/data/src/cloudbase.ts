import cloudbase from "@cloudbase/node-sdk";
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
import { nowIso, todayKey } from "./utils.js";

type CollectionName = "users" | "recordings" | "songs" | "song_jobs" | "usage_quotas" | "provider_events";

export class CloudBaseRepository implements Demo2SongRepository {
  private readonly db: any;

  constructor(envId: string, credentials?: { secretId?: string; secretKey?: string }) {
    const app = cloudbase.init({
      env: envId,
      secretId: credentials?.secretId,
      secretKey: credentials?.secretKey
    });
    this.db = app.database();
  }

  async upsertUserByOpenId(openId: string, sessionKey?: string): Promise<UserRecord> {
    const existing = await this.findOne<UserRecord>("users", { openId });
    if (existing) {
      await this.updateById("users", existing.id, { sessionKey });
      return (await this.findOne<UserRecord>("users", { id: existing.id }))!;
    }
    return this.insert<UserRecord>("users", { openId, sessionKey });
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.findOne<UserRecord>("users", { id });
  }

  async createRecording(input: CreateRecordingInput): Promise<RecordingRecord> {
    return this.insert<RecordingRecord>("recordings", input);
  }

  async findRecordingForUser(id: string, userId: string): Promise<RecordingRecord | null> {
    return this.findOne<RecordingRecord>("recordings", { id, userId });
  }

  async getRecordingById(id: string): Promise<RecordingRecord | null> {
    return this.findOne<RecordingRecord>("recordings", { id });
  }

  async createSong(input: CreateSongInput): Promise<SongRecord> {
    return this.insert<SongRecord>("songs", input);
  }

  async findSongForUser(id: string, userId: string): Promise<SongRecord | null> {
    return this.findOne<SongRecord>("songs", { id, userId });
  }

  async findReadyDemoSongForUser(id: string, userId: string): Promise<SongRecord | null> {
    return this.findOne<SongRecord>("songs", { id, userId, status: "ready", stage: "demo" });
  }

  async getSongById(id: string): Promise<SongRecord | null> {
    return this.findOne<SongRecord>("songs", { id });
  }

  async listSongsForUser(userId: string): Promise<SongRecord[]> {
    const result = await this.collection("songs")
      .where({ userId })
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    return ((result.data as unknown[]) ?? [])
      .map((item) => this.normalize<SongRecord>(item))
      .filter((item): item is SongRecord => Boolean(item));
  }

  async listFullSongsForDemo(demoId: string, userId: string): Promise<SongRecord[]> {
    const result = await this.collection("songs")
      .where({ userId, parentSongId: demoId, stage: "full" })
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    return ((result.data as unknown[]) ?? [])
      .map((item) => this.normalize<SongRecord>(item))
      .filter((item): item is SongRecord => Boolean(item));
  }

  async countReadyFullForDemo(demoId: string): Promise<number> {
    const result = await this.collection("songs")
      .where({ parentSongId: demoId, stage: "full", status: "ready" })
      .count();
    return Number(result.total ?? 0);
  }

  async updateSong(id: string, patch: Partial<SongRecord>): Promise<void> {
    await this.updateById("songs", id, patch);
  }

  async createSongJob(input: CreateSongJobInput): Promise<SongJobRecord> {
    return this.insert<SongJobRecord>("song_jobs", input);
  }

  async findJobForUser(id: string, userId: string): Promise<SongJobRecord | null> {
    return this.findOne<SongJobRecord>("song_jobs", { id, userId });
  }

  async findJobForSongForUser(songId: string, userId: string): Promise<SongJobRecord | null> {
    return this.findOne<SongJobRecord>("song_jobs", { songId, userId });
  }

  async claimNextQueuedJob(): Promise<(SongJobRecord & { song: SongRecord }) | null> {
    const result = await this.collection("song_jobs")
      .where({ status: "queued" })
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();
    const job = this.normalize<SongJobRecord>(result.data?.[0]);
    if (!job?.songId) {
      return null;
    }
    const song = await this.getSongById(job.songId);
    if (!song) {
      return null;
    }
    await this.updateJob(job.id, { status: "running", lockedAt: nowIso() });
    const claimed = await this.findJobForUser(job.id, job.userId);
    return claimed ? { ...claimed, song } : null;
  }

  async updateJob(id: string, patch: Partial<SongJobRecord>): Promise<void> {
    await this.updateById("song_jobs", id, patch);
  }

  async createProviderEvent(input: Omit<ProviderEventRecord, keyof import("./types.js").BaseRecord>): Promise<ProviderEventRecord> {
    return this.insert<ProviderEventRecord>("provider_events", input);
  }

  async consumeQuota(input: { userId: string; kind: SongJobRecord["kind"]; limit: number; dateKey?: string }): Promise<boolean> {
    if (input.limit <= 0) {
      return true;
    }
    const dateKey = input.dateKey ?? todayKey();
    const existing = await this.findOne<UsageQuotaRecord>("usage_quotas", {
      userId: input.userId,
      kind: input.kind,
      dateKey
    });

    if (!existing) {
      await this.insert<UsageQuotaRecord>("usage_quotas", {
        userId: input.userId,
        kind: input.kind,
        dateKey,
        used: 1
      });
      return true;
    }
    if (existing.used >= input.limit) {
      return false;
    }
    await this.updateById("usage_quotas", existing.id, { used: existing.used + 1 });
    return true;
  }

  async refundQuota(input: { userId: string; kind: SongJobRecord["kind"]; dateKey?: string }): Promise<void> {
    const dateKey = input.dateKey ?? todayKey();
    const existing = await this.findOne<UsageQuotaRecord>("usage_quotas", {
      userId: input.userId,
      kind: input.kind,
      dateKey
    });
    if (existing && existing.used > 0) {
      await this.updateById("usage_quotas", existing.id, { used: existing.used - 1 });
    }
  }

  private collection(name: CollectionName) {
    return this.db.collection(name);
  }

  private async insert<T extends { id: string; createdAt: string; updatedAt: string }>(
    collection: CollectionName,
    input: Omit<T, "id" | "createdAt" | "updatedAt">
  ): Promise<T> {
    const timestamp = nowIso();
    const result = await this.collection(collection).add({
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const id = String(result.id);
    await this.collection(collection).doc(id).update({ id, updatedAt: timestamp });
    return {
      id,
      _id: id,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    } as unknown as T;
  }

  private async findOne<T>(collection: CollectionName, query: Record<string, unknown>): Promise<T | null> {
    if (typeof query.id === "string") {
      const result = await this.collection(collection).doc(query.id).get();
      const record = this.normalize<T>(result.data?.[0]);
      return record && this.matchesQuery(record as Record<string, unknown>, query) ? record : null;
    }

    const result = await this.collection(collection).where(query).limit(1).get();
    return this.normalize<T>(result.data?.[0]) ?? null;
  }

  private async updateById(collection: CollectionName, id: string, patch: Record<string, unknown>): Promise<void> {
    const existing = await this.findOne<{ _id?: string; id: string }>(collection, { id });
    if (!existing) {
      throw new Error(`${collection} record not found: ${id}`);
    }
    await this.collection(collection)
      .doc(existing._id ?? existing.id)
      .update({ ...patch, updatedAt: nowIso() });
  }

  private normalize<T>(record: unknown): T | undefined {
    if (!record || typeof record !== "object") {
      return undefined;
    }
    const next = record as Record<string, unknown>;
    if (next.data && typeof next.data === "object" && !Array.isArray(next.data) && !next.createdAt) {
      return {
        ...(next.data as Record<string, unknown>),
        _id: next._id,
        id: String((next.data as Record<string, unknown>).id ?? next._id)
      } as T;
    }
    return {
      ...next,
      id: String(next.id ?? next._id)
    } as T;
  }

  private matchesQuery(record: Record<string, unknown>, query: Record<string, unknown>): boolean {
    return Object.entries(query).every(([key, value]) => record[key] === value);
  }
}
