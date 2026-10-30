import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./schema.js";

export type ApiPaths = paths;
export type ApiClient = Client<paths>;

export function createApiClient(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}): ApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.headers,
    fetch: options.fetch
  });
}
