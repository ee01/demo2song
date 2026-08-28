import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  CLOUDBASE_ENV_ID: z.string().optional(),
  DATA_BACKEND: z.enum(["cloudbase", "memory"]).default("cloudbase"),
  CLOUDBASE_SECRET_ID: z.string().optional(),
  CLOUDBASE_SECRET_KEY: z.string().optional(),
  COS_SECRET_ID: z.string().optional(),
  COS_SECRET_KEY: z.string().optional(),
  COS_BUCKET: z.string().optional(),
  COS_REGION: z.string().default("ap-guangzhou"),
  MINIMAX_API_KEY: z.string().optional(),
  // 国内版用 https://api.minimaxi.com，国际版用 https://api.minimax.io（默认）
  MINIMAX_API_BASE: z.string().url().default("https://api.minimax.io"),
  MUREKA_API_KEY: z.string().optional(),
  PROVIDER_MOCK_MODE: z.coerce.boolean().default(false),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  // 云托管就绪探针会探测此端口；worker 无业务 HTTP，仅提供 /health
  WORKER_PORT: z.coerce.number().int().positive().default(3000),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_SUBSCRIBE_TEMPLATE_ID: z.string().optional()
});

export const env = envSchema.parse(process.env);
