import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export function reshapeV1Payload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error !== "string") {
    return payload;
  }
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "error") params[key] = value;
  }
  return {
    error: Object.keys(params).length > 0 ? { code: record.error, params } : { code: record.error }
  };
}

function validationIssues(error: unknown): unknown {
  if (error instanceof ZodError) return error.issues;
  if (!error || typeof error !== "object") return undefined;
  if ("validation" in error && (error as { validation?: unknown }).validation) {
    return (error as { validation: unknown }).validation;
  }
  if ("cause" in error) return validationIssues((error as { cause?: unknown }).cause);
  return undefined;
}

export function v1ErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const issues = validationIssues(error);
  const status = issues ? 400 : error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (status === 400) {
    return reply.code(400).send({
      error: issues ? { code: "VALIDATION_ERROR", params: { issues } } : { code: "VALIDATION_ERROR" }
    });
  }
  if (status >= 500) {
    request.log.error({ err: error }, "v1 request failed");
  }
  return reply.code(status).send({ error: { code: "INTERNAL_ERROR" } });
}
