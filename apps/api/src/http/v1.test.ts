import { describe, expect, it } from "vitest";
import { reshapeV1Payload } from "./v1.js";

describe("v1 error envelope", () => {
  it("wraps a string error code", () => {
    expect(reshapeV1Payload({ error: "MISSING_USER" })).toEqual({
      error: { code: "MISSING_USER" }
    });
  });

  it("moves extra fields into params", () => {
    expect(
      reshapeV1Payload({
        error: "INVALID_DURATION",
        minSeconds: 3,
        maxSeconds: 60
      })
    ).toEqual({
      error: {
        code: "INVALID_DURATION",
        params: { minSeconds: 3, maxSeconds: 60 }
      }
    });
  });

  it("leaves an already wrapped error alone", () => {
    const payload = { error: { code: "SONG_NOT_FOUND" } };
    expect(reshapeV1Payload(payload)).toEqual(payload);
  });
});
