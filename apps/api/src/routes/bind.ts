import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { ZodTypeAny } from "zod";

declare module "fastify" {
  interface FastifyInstance {
    contractRoutes?: boolean;
  }
}

type Method = "get" | "post";
type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function bindRoute(
  app: FastifyInstance,
  method: Method,
  url: string,
  handler: Handler,
  schema?: { body?: ZodTypeAny; params?: ZodTypeAny }
): void {
  if (app.contractRoutes && schema) {
    app.withTypeProvider<ZodTypeProvider>().route({
      method: method.toUpperCase() as "GET" | "POST",
      url,
      schema,
      handler: handler as never
    });
    return;
  }
  app[method](url, handler);
}
