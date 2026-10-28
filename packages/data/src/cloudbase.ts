import cloudbase from "@cloudbase/node-sdk";
import { RepositoryConflictError } from "./errors.js";
import type {
  BaseRecord,
  CreateRecordingInput,
  CreateSongInput,
  CreateSongJobInput,
  Demo2SongRepository,
  IdentityProvider,
  IdentityRecord,
  MergeLogRecord,
  ProviderEventRecord,
  RecordingRecord,
  SessionRecord,
  SongJobRecord,
  SongRecord,
  UsageQuotaRecord,
  UserRecord
} from "./types.js";
import { nowIso, todayKey, withoutUndefined } from "./utils.js";

type CollectionName =
  | "users"
  | "recordings"
  | "songs"
  | "song_jobs"
  | "usage_quotas"
  | "provider_events"
  | "identities"
  | "sessions"
  | "merge_logs";

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

  async findUserByOpenId(openId: string): Promise<UserRecord | null> {
    return this.findOne<UserRecord>("users", { openId });
  }

  async findIdentity(provider: IdentityProvider, subject: string): Promise<IdentityRecord | null> {
    return this.findOne<IdentityRecord>("identities", { provider, subject });
  }

  async findIdentityByUnionId(unionId: string): Promise<IdentityRecord | null> {
    const matches = await this.listIdentitiesByUnionId(unionId);
    return matches[0] ?? null;
  }

  async listIdentitiesByUnionId(unionId: string): Promise<IdentityRecord[]> {
    if (!unionId) return [];
    return this.listAll<IdentityRecord>("identities", { unionId });
  }

  async listIdentitiesForUser(userId: string): Promise<IdentityRecord[]> {
    const identities = await this.listAll<IdentityRecord>("identities", { userId });
    return identities.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async createIdentity(input: Omit<IdentityRecord, keyof BaseRecord>): Promise<IdentityRecord> {
    const existing = await this.findIdentity(input.provider, input.subject);
    if (existing) {
      throw new RepositoryConflictError(`Identity already exists: ${input.provider}:${input.subject}`);
    }
    return this.insert<IdentityRecord>("identities", withoutUndefined({ ...input }));
  }

  async updateIdentity(id: string, patch: Partial<IdentityRecord>): Promise<void> {
    await this.updateById("identities", id, patch);
  }

  async createUser(input: Partial<UserRecord> = {}): Promise<UserRecord> {
    const { id: _id, _id: _docId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = input;
    return this.insert<UserRecord>("users", withoutUndefined(rest));
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<void> {
    await this.updateById("users", id, patch);
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    return this.findOne<SessionRecord>("sessions", { id });
  }

  async createSession(input: Omit<SessionRecord, keyof BaseRecord>): Promise<SessionRecord> {
    const existing = await this.findSessionByHash(input.refreshTokenHash);
    if (existing) {
      throw new RepositoryConflictError("Session already exists for refresh token hash");
    }
    return this.insert<SessionRecord>("sessions", withoutUndefined({ ...input }));
  }

  async findSessionByHash(hash: string): Promise<SessionRecord | null> {
    return this.findOne<SessionRecord>("sessions", { refreshTokenHash: hash });
  }

  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<void> {
    await this.updateById("sessions", id, patch);
  }

  async revokeSessionsForUser(userId: string): Promise<void> {
    const revokedAt = nowIso();
    const sessions = await this.listAll<SessionRecord>("sessions", { userId });
    for (const session of sessions) {
      if (!session.revokedAt) {
        await this.updateSession(session.id, { revokedAt });
      }
    }
  }

  async reassignUserData(fromUserId: string, toUserId: string): Promise<Record<string, number>> {
    const counts = { recordings: 0, songs: 0, song_jobs: 0, usage_quotas: 0 };
    if (fromUserId === toUserId) return counts;
    counts.recordings = await this.moveUserField("recordings", fromUserId, toUserId);
    counts.songs = await this.moveUserField("songs", fromUserId, toUserId);
    counts.song_jobs = await this.moveUserField("song_jobs", fromUserId, toUserId);
    counts.usage_quotas = await this.mergeQuotas(fromUserId, toUserId);
    return counts;
  }

  async countActiveJobsForUser(userId: string): Promise<number> {
    const jobs = await this.listAll<SongJobRecord>("song_jobs", { userId });
    return jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  }

  async createMergeLog(input: Omit<MergeLogRecord, keyof BaseRecord>): Promise<MergeLogRecord> {
    return this.insert<MergeLogRecord>("merge_logs", withoutUndefined({ ...input }));
  }

  async updateMergeLog(id: string, patch: Partial<MergeLogRecord>): Promise<void> {
    await this.updateById("merge_logs", id, patch);
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

  private async moveUserField(
    collection: "recordings" | "songs" | "song_jobs",
    fromUserId: string,
    toUserId: string
  ): Promise<number> {
    const records = await this.listAll<{ id: string; userId: string }>(collection, { userId: fromUserId });
    for (const record of records) {
      await this.updateById(collection, record.id, { userId: toUserId });
    }
    return records.length;
  }

  private async mergeQuotas(fromUserId: string, toUserId: string): Promise<number> {
    const source = await this.listAll<UsageQuotaRecord>("usage_quotas", { userId: fromUserId });
    const targetRows = await this.listAll<UsageQuotaRecord>("usage_quotas", { userId: toUserId });
    const targetByKey = new Map<string, UsageQuotaRecord>();
    for (const quota of targetRows) targetByKey.set(`${quota.dateKey}:${quota.kind}`, quota);

    for (const quota of source) {
      const key = `${quota.dateKey}:${quota.kind}`;
      const target = targetByKey.get(key);
      if (target?.appliedSourceIds?.includes(quota.id)) {
        await this.deleteById("usage_quotas", quota.id);
        continue;
      }
      if (target) {
        const appliedSourceIds = [...(target.appliedSourceIds ?? []), quota.id];
        const used = target.used + quota.used;
        await this.updateById("usage_quotas", target.id, { used, appliedSourceIds });
        target.used = used;
        target.appliedSourceIds = appliedSourceIds;
      } else {
        const created = await this.insert<UsageQuotaRecord>("usage_quotas", {
          userId: toUserId,
          dateKey: quota.dateKey,
          kind: quota.kind,
          used: quota.used,
          appliedSourceIds: [quota.id]
        });
        targetByKey.set(key, created);
      }
      await this.deleteById("usage_quotas", quota.id);
    }
    return source.length;
  }

  private async listAll<T>(collection: CollectionName, query: Record<string, unknown>): Promise<T[]> {
    const pageSize = 100;
    const rows: T[] = [];
    for (let skip = 0; skip < 5000; skip += pageSize) {
      const result = await this.collection(collection).where(query).skip(skip).limit(pageSize).get();
      const batch = ((result.data as unknown[]) ?? [])
        .map((item) => this.normalize<T>(item))
        .filter((item): item is T => Boolean(item));
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
    return rows;
  }

  private async deleteById(collection: CollectionName, id: string): Promise<void> {
    const existing = await this.findOne<{ _id?: string; id: string }>(collection, { id });
    if (!existing) return;
    await this.collection(collection).doc(existing._id ?? existing.id).remove();
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
