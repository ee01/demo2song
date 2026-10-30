import { accountRoutes } from "./routes/account.js";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { validatorCompiler } from "fastify-type-provider-zod";
import { reshapeV1Payload, v1ErrorHandler } from "./http/v1.js";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { jobRoutes } from "./routes/jobs.js";
import { publicRoutes } from "./routes/public.js";
import { recordingRoutes } from "./routes/recordings.js";
import { songRoutes } from "./routes/songs.js";

async function mountApiRoutes(app: FastifyInstance): Promise<void> {
  await configRoutes(app);
  await authRoutes(app);
  await accountRoutes(app);
  await recordingRoutes(app);
  await songRoutes(app);
  await jobRoutes(app);
  await publicRoutes(app);
}

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
  await mountApiRoutes(app);
  await app.register(async (scope) => {
    scope.decorate("contractRoutes", true);
    scope.setValidatorCompiler(validatorCompiler);
    scope.setErrorHandler(v1ErrorHandler);
    scope.addHook("preSerialization", async (_request, _reply, payload) => reshapeV1Payload(payload));
    await mountApiRoutes(scope);
  }, { prefix: "/v1" });

  return app;
}
