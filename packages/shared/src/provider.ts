import type { ProviderName, SongPromptInput } from "./types.js";

export interface ProviderCapabilities {
  name: ProviderName;
  supportsHummingMelody: boolean;
  supportsSongExtend: boolean;
  extendIsApproximate: boolean;
  supportsCommercialUse: "yes" | "no" | "unknown";
  maxReferenceAudioSeconds: number;
  minReferenceAudioSeconds: number;
}

export interface ProviderAudioInput {
  objectKey: string;
  signedUrl: string;
  audioBase64?: string;
  mimeType: string;
  durationSeconds: number;
}

export interface ProviderSongResult {
  provider: ProviderName;
  providerTaskId?: string;
  audioUrl?: string;
  audioBase64?: string;
  audioHex?: string;
  mimeType: string;
  durationSeconds?: number;
  title?: string;
  lyrics?: string;
  costEstimateUsd?: number;
  raw: unknown;
}

export interface CreateDemoSongInput {
  userId: string;
  recording: ProviderAudioInput;
  prompt: SongPromptInput;
  lyrics?: string;
  targetDurationSeconds: number;
}

export interface CreateFullSongInput {
  userId: string;
  recording: ProviderAudioInput;
  demoSong?: ProviderAudioInput;
  prompt: SongPromptInput;
  lyrics?: string;
  targetDurationSeconds: number;
}

export interface NormalizedProviderError {
  code: string;
  message: string;
  retryable: boolean;
  raw?: unknown;
}

export interface MusicProvider {
  getCapabilities(): ProviderCapabilities;
  createDemoSong(input: CreateDemoSongInput): Promise<ProviderSongResult>;
  createFullSong(input: CreateFullSongInput): Promise<ProviderSongResult>;
  normalizeError(error: unknown): NormalizedProviderError;
}
