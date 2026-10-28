import type {
  JobStatus,
  ProviderName,
  SongJobKind,
  SongPromptInput,
  SongStage,
  SongStatus
} from "@demo2song/shared";

export interface BaseRecord {
  _id?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type IdentityProvider = "wechat_mp" | "wechat_app" | "apple";

export interface UserRecord extends BaseRecord {
  openId?: string;
  sessionKey?: string;
  displayName?: string;
  mergedInto?: string;
  deletedAt?: string;
}

export interface IdentityRecord extends BaseRecord {
  userId: string;
  provider: IdentityProvider;
  subject: string;
  unionId?: string;
  meta?: Record<string, unknown>;
}

export interface SessionRecord extends BaseRecord {
  userId: string;
  client: "mp" | "ios" | "web";
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  replacedBy?: string;
}

export interface MergeLogRecord extends BaseRecord {
  survivorUserId: string;
  absorbedUserId: string;
  status: "pending" | "done" | "failed";
  movedCounts?: Record<string, number>;
  error?: string;
}

export interface RecordingRecord extends BaseRecord {
  userId: string;
  objectKey: string;
  mimeType: string;
  durationSeconds: number;
  originalFilename?: string;
  rawMeta?: Record<string, unknown>;
}

export interface SongRecord extends BaseRecord {
  userId: string;
  recordingId: string;
  parentSongId?: string;
  stage: SongStage;
  status: SongStatus;
  provider: ProviderName;
  title?: string;
  objectKey?: string;
  mimeType?: string;
  durationSeconds?: number;
  lyrics?: string;
  prompt: SongPromptInput | Record<string, unknown>;
  providerTaskId?: string;
  providerRaw?: unknown;
  costEstimateUsd?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface SongJobRecord extends BaseRecord {
  userId: string;
  recordingId?: string;
  songId?: string;
  kind: SongJobKind;
  status: JobStatus;
  provider: ProviderName;
  requestPayload: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  lockedAt?: string;
  notificationAccepted?: boolean;
  notificationSentAt?: string;
  notificationError?: string;
}

export interface UsageQuotaRecord extends BaseRecord {
  userId: string;
  dateKey: string;
  kind: SongJobKind;
  used: number;
  appliedSourceIds?: string[];
}

export interface ProviderEventRecord extends BaseRecord {
  provider: ProviderName;
  jobId?: string;
  eventType: string;
  payload: unknown;
}

export interface CreateRecordingInput {
  userId: string;
  objectKey: string;
  mimeType: string;
  durationSeconds: number;
  originalFilename?: string;
  rawMeta?: Record<string, unknown>;
}

export type CreateSongInput = Omit<SongRecord, keyof BaseRecord | "providerRaw"> & {
  providerRaw?: unknown;
};

export type CreateSongJobInput = Omit<SongJobRecord, keyof BaseRecord>;

export interface Demo2SongRepository {
  upsertUserByOpenId(openId: string, sessionKey?: string): Promise<UserRecord>;
  getUserById(id: string): Promise<UserRecord | null>;
  findUserByOpenId(openId: string): Promise<UserRecord | null>;
  findIdentity(provider: IdentityProvider, subject: string): Promise<IdentityRecord | null>;
  findIdentityByUnionId(unionId: string): Promise<IdentityRecord | null>;
  listIdentitiesByUnionId(unionId: string): Promise<IdentityRecord[]>;
  listIdentitiesForUser(userId: string): Promise<IdentityRecord[]>;
  createIdentity(input: Omit<IdentityRecord, keyof BaseRecord>): Promise<IdentityRecord>;
  updateIdentity(id: string, patch: Partial<IdentityRecord>): Promise<void>;
  createUser(input?: Partial<UserRecord>): Promise<UserRecord>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<void>;
  createSession(input: Omit<SessionRecord, keyof BaseRecord>): Promise<SessionRecord>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  findSessionByHash(hash: string): Promise<SessionRecord | null>;
  updateSession(id: string, patch: Partial<SessionRecord>): Promise<void>;
  revokeSessionsForUser(userId: string): Promise<void>;
  reassignUserData(fromUserId: string, toUserId: string): Promise<Record<string, number>>;
  countActiveJobsForUser(userId: string): Promise<number>;
  createMergeLog(input: Omit<MergeLogRecord, keyof BaseRecord>): Promise<MergeLogRecord>;
  updateMergeLog(id: string, patch: Partial<MergeLogRecord>): Promise<void>;
  createRecording(input: CreateRecordingInput): Promise<RecordingRecord>;
  findRecordingForUser(id: string, userId: string): Promise<RecordingRecord | null>;
  getRecordingById(id: string): Promise<RecordingRecord | null>;
  createSong(input: CreateSongInput): Promise<SongRecord>;
  findSongForUser(id: string, userId: string): Promise<SongRecord | null>;
  findReadyDemoSongForUser(id: string, userId: string): Promise<SongRecord | null>;
  getSongById(id: string): Promise<SongRecord | null>;
  listSongsForUser(userId: string): Promise<SongRecord[]>;
  listFullSongsForDemo(demoId: string, userId: string): Promise<SongRecord[]>;
  countReadyFullForDemo(demoId: string): Promise<number>;
  updateSong(id: string, patch: Partial<SongRecord>): Promise<void>;
  createSongJob(input: CreateSongJobInput): Promise<SongJobRecord>;
  findJobForUser(id: string, userId: string): Promise<SongJobRecord | null>;
  findJobForSongForUser(songId: string, userId: string): Promise<SongJobRecord | null>;
  claimNextQueuedJob(): Promise<(SongJobRecord & { song: SongRecord }) | null>;
  updateJob(id: string, patch: Partial<SongJobRecord>): Promise<void>;
  createProviderEvent(input: Omit<ProviderEventRecord, keyof BaseRecord>): Promise<ProviderEventRecord>;
  consumeQuota(input: { userId: string; kind: SongJobKind; limit: number; dateKey?: string }): Promise<boolean>;
  refundQuota(input: { userId: string; kind: SongJobKind; dateKey?: string }): Promise<void>;
}
