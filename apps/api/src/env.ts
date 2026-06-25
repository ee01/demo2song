import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  CLOUDBASE_ENV_ID: z.string().optional(),
  DATA_BACKEND: z.enum(["cloudbase", "memory"]).default("cloudbase"),
  CLOUDBASE_SECRET_ID: z.string().optional(),
  CLOUDBASE_SECRET_KEY: z.string().optional(),
  API_PORT: z.coerce.number().int().positive().default(3100),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_LOGIN_STRICT: z.coerce.boolean().default(false),
  COS_SECRET_ID: z.string().optional(),
  COS_SECRET_KEY: z.string().optional(),
  COS_BUCKET: z.string().optional(),
  COS_REGION: z.string().default("ap-guangzhou"),
  COS_CDN_BASE_URL: z.string().url().optional(),
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_GROUP_ID: z.string().optional(),
  MUREKA_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
