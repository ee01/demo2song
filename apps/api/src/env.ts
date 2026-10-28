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
  WECHAT_OPEN_APP_ID: z.string().optional(),
  WECHAT_OPEN_APP_SECRET: z.string().optional(),
  WECHAT_LOGIN_STRICT: z.preprocess((value) => {
    if (value === undefined || value === "") return false;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  }, z.boolean()),
  JWT_SECRET: z.string().optional(),
  LEGACY_HEADER_AUTH: z.preprocess((value) => {
    if (value === undefined || value === "") return true;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  }, z.boolean()),
  WECHAT_SUBSCRIBE_TEMPLATE_ID: z.string().optional(),
  COS_SECRET_ID: z.string().optional(),
  COS_SECRET_KEY: z.string().optional(),
  COS_BUCKET: z.string().optional(),
  COS_REGION: z.string().default("ap-guangzhou"),
  COS_CDN_BASE_URL: z.string().url().optional(),
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_API_BASE: z.string().url().default("https://api.minimax.io"),
  MINIMAX_GROUP_ID: z.string().optional(),
  MUREKA_API_KEY: z.string().optional()
});

const parsed = envSchema.parse(process.env);
const DEV_JWT_SECRET = "dev-only-jwt-secret-not-for-production";

function resolveJwtSecret(value: string | undefined): string {
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return DEV_JWT_SECRET;
}

export const env = {
  ...parsed,
  JWT_SECRET: resolveJwtSecret(parsed.JWT_SECRET)
};
