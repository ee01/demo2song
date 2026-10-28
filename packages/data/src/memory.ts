import { RepositoryConflictError } from "./errors.js";
import type {
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
import { createId, nowIso, todayKey, withoutUndefined } from "./utils.js";

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

export class InMemoryRepository implements Demo2SongRepository {
  private readonly data: Record<CollectionName, Map<string, any>> = {
    users: new Map(),
    recordings: new Map(),
    songs: new Map(),
    song_jobs: new Map(),
    usage_quotas: new Map(),
    provider_events: new Map(),
    identities: new Map(),
    sessions: new Map(),
    merge_logs: new Map()
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

  async findUserByOpenId(openId: string): Promise<UserRecord | null> {
    return ([...this.data.users.values()] as UserRecord[]).find((user) => user.openId === openId) ?? null;
  }

  async findIdentity(provider: IdentityProvider, subject: string): Promise<IdentityRecord | null> {
    return (
      ([...this.data.identities.values()] as IdentityRecord[]).find(
        (identity) => identity.provider === provider && identity.subject === subject
      ) ?? null
    );
  }

  async findIdentityByUnionId(unionId: string): Promise<IdentityRecord | null> {
    const matches = await this.listIdentitiesByUnionId(unionId);
    return matches[0] ?? null;
  }

  async listIdentitiesByUnionId(unionId: string): Promise<IdentityRecord[]> {
    if (!unionId) return [];
    return ([...this.data.identities.values()] as IdentityRecord[]).filter((identity) => identity.unionId === unionId);
  }

  async listIdentitiesForUser(userId: string): Promise<IdentityRecord[]> {
    return ([...this.data.identities.values()] as IdentityRecord[])
      .filter((identity) => identity.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async createIdentity(input: Omit<IdentityRecord, keyof import("./types.js").BaseRecord>): Promise<IdentityRecord> {
    const existing = await this.findIdentity(input.provider, input.subject);
    if (existing) {
      throw new RepositoryConflictError(`Identity already exists: ${input.provider}:${input.subject}`);
    }
    return this.insert("identities", withoutUndefined({ ...input }));
  }

  async updateIdentity(id: string, patch: Partial<IdentityRecord>): Promise<void> {
    this.update("identities", id, patch);
  }

  async createUser(input: Partial<UserRecord> = {}): Promise<UserRecord> {
    const { id: _id, _id: _docId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = input;
    return this.insert("users", withoutUndefined(rest));
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<void> {
    this.update("users", id, patch);
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    return (this.data.sessions.get(id) as SessionRecord | undefined) ?? null;
  }

  async createSession(input: Omit<SessionRecord, keyof import("./types.js").BaseRecord>): Promise<SessionRecord> {
    const existing = await this.findSessionByHash(input.refreshTokenHash);
    if (existing) {
      throw new RepositoryConflictError("Session already exists for refresh token hash");
    }
    return this.insert("sessions", withoutUndefined({ ...input }));
  }

  async findSessionByHash(hash: string): Promise<SessionRecord | null> {
    return (
      ([...this.data.sessions.values()] as SessionRecord[]).find((session) => session.refreshTokenHash === hash) ?? null
    );
  }

  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<void> {
    this.update("sessions", id, patch);
  }

  async revokeSessionsForUser(userId: string): Promise<void> {
    const revokedAt = nowIso();
    for (const session of [...this.data.sessions.values()] as SessionRecord[]) {
      if (session.userId === userId && !session.revokedAt) {
        this.update("sessions", session.id, { revokedAt });
      }
    }
  }

  async reassignUserData(fromUserId: string, toUserId: string): Promise<Record<string, number>> {
    const counts = { recordings: 0, songs: 0, song_jobs: 0, usage_quotas: 0 };
    if (fromUserId === toUserId) return counts;
    counts.recordings = this.moveUserField("recordings", fromUserId, toUserId);
    counts.songs = this.moveUserField("songs", fromUserId, toUserId);
    counts.song_jobs = this.moveUserField("song_jobs", fromUserId, toUserId);
    counts.usage_quotas = await this.mergeQuotas(fromUserId, toUserId);
    return counts;
  }

  async countActiveJobsForUser(userId: string): Promise<number> {
    return ([...this.data.song_jobs.values()] as SongJobRecord[]).filter(
      (job) => job.userId === userId && (job.status === "queued" || job.status === "running")
    ).length;
  }

  async createMergeLog(input: Omit<MergeLogRecord, keyof import("./types.js").BaseRecord>): Promise<MergeLogRecord> {
    return this.insert("merge_logs", withoutUndefined({ ...input }));
  }

  async updateMergeLog(id: string, patch: Partial<MergeLogRecord>): Promise<void> {
    this.update("merge_logs", id, patch);
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

  private moveUserField(collection: "recordings" | "songs" | "song_jobs", fromUserId: string, toUserId: string): number {
    let moved = 0;
    for (const record of [...this.data[collection].values()] as Array<{ id: string; userId: string }>) {
      if (record.userId !== fromUserId) continue;
      this.update(collection, record.id, { userId: toUserId });
      moved += 1;
    }
    return moved;
  }

  private async mergeQuotas(fromUserId: string, toUserId: string): Promise<number> {
    const source = ([...this.data.usage_quotas.values()] as UsageQuotaRecord[]).filter((quota) => quota.userId === fromUserId);
    const targetByKey = new Map<string, UsageQuotaRecord>();
    for (const quota of [...this.data.usage_quotas.values()] as UsageQuotaRecord[]) {
      if (quota.userId === toUserId) targetByKey.set(`${quota.dateKey}:${quota.kind}`, quota);
    }

    for (const quota of source) {
      const key = `${quota.dateKey}:${quota.kind}`;
      const target = targetByKey.get(key);
      if (target?.appliedSourceIds?.includes(quota.id)) {
        this.delete("usage_quotas", quota.id);
        continue;
      }
      if (target) {
        const appliedSourceIds = [...(target.appliedSourceIds ?? []), quota.id];
        const used = target.used + quota.used;
        this.update("usage_quotas", target.id, { used, appliedSourceIds });
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
      this.delete("usage_quotas", quota.id);
    }
    return source.length;
  }

  private delete(collection: CollectionName, id: string): void {
    this.data[collection].delete(id);
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
