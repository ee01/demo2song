import type { FastifyInstance } from "fastify";
import { loadValidatedConfig } from "@demo2song/config";
import { env } from "../env.js";

const config = loadValidatedConfig();

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/config/public", async () => ({
    minRecordingSeconds: config.limits.minRecordingSeconds,
    maxRecordingSeconds: config.limits.maxRecordingSeconds,
    demoTargetSeconds: config.limits.demoTargetSeconds,
    enableFullSong: config.features.enableExtendSong,
    generationNoticeTemplateId: env.WECHAT_SUBSCRIBE_TEMPLATE_ID || undefined
  }));
}
