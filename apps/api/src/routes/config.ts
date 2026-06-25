import type { FastifyInstance } from "fastify";
import { loadValidatedConfig } from "@demo2song/config";

const config = loadValidatedConfig();

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/config/public", async () => ({
    minRecordingSeconds: config.limits.minRecordingSeconds,
    maxRecordingSeconds: config.limits.maxRecordingSeconds,
    demoTargetSeconds: config.limits.demoTargetSeconds,
    enableExtendSong: config.features.enableExtendSong
  }));
}
