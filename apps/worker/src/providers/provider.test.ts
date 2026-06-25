import { describe, expect, it } from "vitest";
import { createProvider } from "./index.js";

describe("provider factory", () => {
  it("returns MiniMax by name", () => {
    expect(createProvider("minimax").getCapabilities().name).toBe("minimax");
  });

  it("returns Mureka by name", () => {
    expect(createProvider("mureka").getCapabilities().supportsSongExtend).toBe(true);
  });
});
