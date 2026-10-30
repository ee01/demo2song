import { z } from "../zod.js";

export const providerNameSchema = z.enum(["minimax", "mureka"]).openapi("ProviderName");
export type ProviderName = z.infer<typeof providerNameSchema>;

export const songJobKindSchema = z.enum(["demo", "full"]).openapi("SongJobKind");
export type SongJobKind = z.infer<typeof songJobKindSchema>;

export const jobStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]).openapi("JobStatus");
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const songStatusSchema = z.enum(["generating", "ready", "failed"]).openapi("SongStatus");
export type SongStatus = z.infer<typeof songStatusSchema>;

export const songStageSchema = z.enum(["demo", "full"]).openapi("SongStage");
export type SongStage = z.infer<typeof songStageSchema>;

export const songLanguageSchema = z.enum(["zh", "en", "ja", "ko", "auto"]).openapi("SongLanguage");
export type SongLanguage = z.infer<typeof songLanguageSchema>;

export const vocalGenderSchema = z.enum(["female", "male", "mixed", "auto"]).openapi("VocalGender");
export type VocalGender = z.infer<typeof vocalGenderSchema>;

export const identityProviderSchema = z.enum(["wechat_mp", "wechat_app", "apple"]).openapi("IdentityProvider");
export type IdentityProvider = z.infer<typeof identityProviderSchema>;

export const clientKindSchema = z.enum(["mp", "ios", "web"]).openapi("ClientKind");
export type ClientKind = z.infer<typeof clientKindSchema>;

export const idParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .openapi("IdParams");

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      params: z.record(z.string(), z.any()).optional()
    })
  })
  .openapi("ApiError");
export type ApiError = z.infer<typeof apiErrorSchema>;
