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

export interface UserRecord extends BaseRecord {
  openId: string;
  sessionKey?: string;
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
}

export interface UsageQuotaRecord extends BaseRecord {
  userId: string;
  dateKey: string;
  kind: SongJobKind;
  used: number;
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
  claimNextQueuedJob(): Promise<(SongJobRecord & { song: SongRecord }) | null>;
  updateJob(id: string, patch: Partial<SongJobRecord>): Promise<void>;
  createProviderEvent(input: Omit<ProviderEventRecord, keyof BaseRecord>): Promise<ProviderEventRecord>;
  consumeQuota(input: { userId: string; kind: SongJobKind; limit: number; dateKey?: string }): Promise<boolean>;
  refundQuota(input: { userId: string; kind: SongJobKind; dateKey?: string }): Promise<void>;
}
