import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { jobRoutes } from "./routes/jobs.js";
import { publicRoutes } from "./routes/public.js";
import { recordingRoutes } from "./routes/recordings.js";
import { songRoutes } from "./routes/songs.js";

export async function buildApp() {
  // Keep Fastify's request-body ceiling aligned with the CloudBase CloudRun
  // gateway and the multipart file limit. Fastify otherwise defaults to 1 MiB.
  const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1
    }
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(recordingRoutes);
  await app.register(songRoutes);
  await app.register(jobRoutes);
  await app.register(publicRoutes);

  return app;
}
