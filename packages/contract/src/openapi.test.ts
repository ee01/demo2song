import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoJobSchema } from "./schemas/songs.js";
import { createOpenApiDocument, renderOpenApiYaml } from "./openapi.js";

describe("contract", () => {
  it("applies prompt defaults for a demo job", () => {
    expect(
      demoJobSchema.parse({
        recordingId: "rec-1",
        prompt: { style: "pop" }
      })
    ).toMatchObject({
      recordingId: "rec-1",
      prompt: { style: "pop", language: "zh", vocalGender: "auto" }
    });
  });

  it("rejects an empty style", () => {
    expect(() =>
      demoJobSchema.parse({
        recordingId: "rec-1",
        prompt: { style: "" }
      })
    ).toThrow();
  });

  it("renders a stable OpenAPI document", () => {
    const first = renderOpenApiYaml();
    const second = renderOpenApiYaml();
    expect(second).toBe(first);

    const committed = readFileSync(fileURLToPath(new URL("../openapi.yaml", import.meta.url)), "utf8");
    expect(committed).toBe(first);

    const document = createOpenApiDocument() as { paths: Record<string, unknown> };
    expect(document.paths["/v1/songs/demo-jobs"]).toBeTruthy();
    expect(document.paths["/v1/auth/wechat-mp"]).toBeTruthy();
    expect(document.paths["/v1/public/songs/{id}"]).toBeTruthy();
  });
});
