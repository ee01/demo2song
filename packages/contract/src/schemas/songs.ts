import {
  jobStatusSchema,
  providerNameSchema,
  songLanguageSchema,
  songStageSchema,
  songStatusSchema,
  vocalGenderSchema
} from "./common.js";
import { z } from "../zod.js";

export const songPromptSchema = z
  .object({
    style: z.string().min(1).max(120),
    mood: z.string().max(80).optional(),
    language: songLanguageSchema.default("zh"),
    vocalGender: vocalGenderSchema.default("auto"),
    description: z.string().max(500).optional(),
    lyricSeed: z.string().max(1000).optional()
  })
  .openapi("SongPrompt");
export type SongPromptInput = z.infer<typeof songPromptSchema>;

export const promptOverrideSchema = z
  .object({
    style: z.string().min(1).max(120).optional(),
    mood: z.string().max(80).optional(),
    language: songLanguageSchema.optional(),
    vocalGender: vocalGenderSchema.optional(),
    description: z.string().max(500).optional(),
    lyricSeed: z.string().max(1000).optional()
  })
  .openapi("SongPromptOverride");

export const demoJobSchema = z
  .object({
    recordingId: z.string().min(1),
    prompt: songPromptSchema
  })
  .openapi("CreateDemoJobRequest");
export type CreateDemoJobRequest = z.infer<typeof demoJobSchema>;

export const createDemoJobResponseSchema = z
  .object({
    jobId: z.string(),
    songId: z.string(),
    status: jobStatusSchema
  })
  .openapi("CreateDemoJobResponse");
export type CreateDemoJobResponse = z.infer<typeof createDemoJobResponseSchema>;

export const fullJobSchema = z
  .object({
    prompt: promptOverrideSchema.optional(),
    title: z.string().max(80).optional(),
    lyrics: z.string().max(3500).optional()
  })
  .openapi("CreateFullJobRequest");
export type CreateFullJobRequest = z.infer<typeof fullJobSchema>;

export const createFullJobResponseSchema = z
  .object({
    jobId: z.string(),
    songId: z.string(),
    status: jobStatusSchema,
    mode: z.enum(["regenerate", "extend"])
  })
  .openapi("CreateFullJobResponse");
export type CreateFullJobResponse = z.infer<typeof createFullJobResponseSchema>;

export const fullDraftSchema = z
  .object({
    prompt: promptOverrideSchema.optional()
  })
  .openapi("GenerateFullDraftRequest");
export type GenerateFullDraftRequest = z.infer<typeof fullDraftSchema>;

export const generateFullDraftResponseSchema = z
  .object({
    title: z.string(),
    lyrics: z.string(),
    styleTags: z.string().optional()
  })
  .openapi("GenerateFullDraftResponse");
export type GenerateFullDraftResponse = z.infer<typeof generateFullDraftResponseSchema>;

export const hummingRecordingSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    objectKey: z.string(),
    mimeType: z.string(),
    durationSeconds: z.number(),
    originalFilename: z.string().optional(),
    createdAt: z.string()
  })
  .openapi("HummingRecording");
export type HummingRecording = z.infer<typeof hummingRecordingSchema>;

export const songBriefSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    recordingId: z.string(),
    stage: songStageSchema,
    status: songStatusSchema,
    title: z.string().optional(),
    provider: providerNameSchema,
    objectKey: z.string().optional(),
    playbackUrl: z.string().optional(),
    durationSeconds: z.number().optional(),
    lyrics: z.string().optional(),
    createdAt: z.string(),
    jobId: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional()
  })
  .openapi("SongBrief");
export type SongBrief = z.infer<typeof songBriefSchema>;

export const songDetailSchema = songBriefSchema
  .extend({
    recordingPlaybackUrl: z.string().optional(),
    recordingDurationSeconds: z.number().optional(),
    parentDemoId: z.string().optional(),
    parentDemoPlaybackUrl: z.string().optional(),
    hasFull: z.boolean().optional(),
    prompt: songPromptSchema.optional()
  })
  .openapi("SongDetail");
export type SongDetail = z.infer<typeof songDetailSchema>;

export const mySongsResponseSchema = z
  .object({
    demos: z.array(songBriefSchema),
    fullSongs: z.array(songBriefSchema)
  })
  .openapi("MySongsResponse");
export type MySongsResponse = z.infer<typeof mySongsResponseSchema>;

export const publicSongSchema = z
  .object({
    id: z.string(),
    stage: songStageSchema,
    status: songStatusSchema,
    title: z.string().optional(),
    durationSeconds: z.number().optional(),
    lyrics: z.string().optional(),
    playbackUrl: z.string().optional()
  })
  .openapi("PublicSong");
export type PublicSong = z.infer<typeof publicSongSchema>;

export const jobDetailSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["demo", "full"]),
    status: jobStatusSchema,
    provider: providerNameSchema,
    songId: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .openapi("JobDetail");
export type JobDetail = z.infer<typeof jobDetailSchema>;

export const publicAppConfigSchema = z
  .object({
    minRecordingSeconds: z.number(),
    maxRecordingSeconds: z.number(),
    demoTargetSeconds: z.number(),
    enableFullSong: z.boolean(),
    options: z.object({ styles: z.array(z.string()), moods: z.array(z.string()), languages: z.array(z.object({label: z.string(), value: z.string()})), genders: z.array(z.object({label: z.string(), value: z.string()})) }).optional(),
    generationNoticeTemplateId: z.string().optional()
  })
  .openapi("PublicAppConfig");
export type PublicAppConfig = z.infer<typeof publicAppConfigSchema>;

export const legacyLoginResponseSchema = z
  .object({
    userId: z.string()
  })
  .openapi("LegacyLoginResponse");

export const okResponseSchema = z
  .object({
    ok: z.literal(true)
  })
  .openapi("OkResponse");

export const recordingUploadSchema = z
  .object({
    file: z.string().openapi({ description: "音频文件", format: "binary" }),
    durationSeconds: z.string().openapi({ description: "录音时长（秒），表单字段" })
  })
  .openapi("RecordingUpload");
