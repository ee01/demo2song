import { describe, expect, it } from "vitest";
import { createApiClient } from "./index.js";

describe("contract client", () => {
  it("calls a typed public endpoint", async () => {
    const seen: Array<{ url: string; method: string }> = [];
    const client = createApiClient({
      baseUrl: "https://api.demo2song.eexx.me",
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        seen.push({ url, method: init?.method ?? (input instanceof Request ? input.method : "GET") });
        return new Response(
          JSON.stringify({
            minRecordingSeconds: 3,
            maxRecordingSeconds: 60,
            demoTargetSeconds: 30,
            enableFullSong: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    });

    const response = await client.GET("/v1/config/public");
    expect(response.response.status).toBe(200);
    expect(response.data).toMatchObject({ minRecordingSeconds: 3, enableFullSong: true });
    expect(seen).toEqual([
      { url: "https://api.demo2song.eexx.me/v1/config/public", method: "GET" }
    ]);
  });
});
