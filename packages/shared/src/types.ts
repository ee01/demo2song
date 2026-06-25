export type ProviderName = "minimax" | "mureka";

export type SongJobKind = "demo" | "extend";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type SongStatus = "generating" | "ready" | "failed";

export type SongStage = "demo" | "full";

export type SongLanguage = "zh" | "en" | "ja" | "ko" | "auto";

export type VocalGender = "female" | "male" | "mixed" | "auto";

export interface HummingRecording {
  id: string;
  userId: string;
  objectKey: string;
  mimeType: string;
  durationSeconds: number;
  originalFilename?: string;
  createdAt: string;
}

export interface SongBrief {
  id: string;
  userId: string;
  recordingId: string;
  stage: SongStage;
  status: SongStatus;
  title?: string;
  provider: ProviderName;
  objectKey?: string;
  playbackUrl?: string;
  durationSeconds?: number;
  lyrics?: string;
  createdAt: string;
}

export interface SongPromptInput {
  style: string;
  mood?: string;
  language: SongLanguage;
  vocalGender: VocalGender;
  description?: string;
  lyricSeed?: string;
}

export interface CreateDemoJobRequest {
  recordingId: string;
  prompt: SongPromptInput;
}

export interface CreateDemoJobResponse {
  jobId: string;
  songId: string;
  status: JobStatus;
}

export interface ExtendSongJobResponse {
  jobId: string;
  songId: string;
  status: JobStatus;
  capability: "supported" | "approximate";
}

export interface JobDetail {
  id: string;
  kind: SongJobKind;
  status: JobStatus;
  provider: ProviderName;
  songId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAppConfig {
  minRecordingSeconds: number;
  maxRecordingSeconds: number;
  demoTargetSeconds: number;
  enableExtendSong: boolean;
}
