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
  MUREKA_API_KEY: z.string().optional(),
  PROVIDER_MOCK_MODE: z.coerce.boolean().default(false),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000)
});

export const env = envSchema.parse(process.env);
