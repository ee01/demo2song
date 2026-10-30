import { identityProviderSchema } from "./common.js";
import { z } from "../zod.js";

export const wechatCodeSchema = z
  .object({
    code: z.string().min(1)
  })
  .openapi("WechatCodeRequest");

export const appleLoginSchema = z
  .object({
    identityToken: z.string().min(1),
    authorizationCode: z.string().min(1),
    fullName: z.string().max(120).optional()
  })
  .openapi("AppleLoginRequest");

export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1)
  })
  .openapi("RefreshRequest");

export const meSchema = z
  .object({
    id: z.string(),
    displayName: z.string().optional(),
    identities: z.array(
      z.object({
        provider: identityProviderSchema,
        linkedAt: z.string()
      })
    )
  })
  .openapi("Me");
export type Me = z.infer<typeof meSchema>;

export const authResultSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().int(),
    user: meSchema
  })
  .openapi("AuthResult");
export type AuthResult = z.infer<typeof authResultSchema>;

export const linkIdentitySchema = z
  .discriminatedUnion("provider", [
    z.object({
      provider: z.literal("wechat_app"),
      code: z.string().min(1)
    }),
    z.object({
      provider: z.literal("apple"),
      identityToken: z.string().min(1),
      authorizationCode: z.string().min(1),
      fullName: z.string().max(120).optional()
    })
  ])
  .openapi("LinkIdentityRequest");

export const mergeRequestSchema = z
  .object({
    mergeToken: z.string().min(1)
  })
  .openapi("MergeRequest");

export const mergeRequiredSchema = z
  .object({
    error: z.object({
      code: z.literal("MERGE_REQUIRED"),
      params: z.object({
        mergeToken: z.string(),
        target: z.object({
          songCount: z.number().int(),
          recordingCount: z.number().int(),
          lastActiveAt: z.string()
        }),
        current: z.object({
          songCount: z.number().int(),
          recordingCount: z.number().int()
        })
      })
    })
  })
  .openapi("MergeRequired");
export type MergeRequired = z.infer<typeof mergeRequiredSchema>;
