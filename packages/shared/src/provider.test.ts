import { describe, expect, it } from "vitest";
import type { ProviderCapabilities } from "./provider.js";

const minimaxCapabilities: ProviderCapabilities = {
  name: "minimax",
  supportsHummingMelody: true,
  supportsSongExtend: false,
  extendIsApproximate: true,
  supportsCommercialUse: "unknown",
  minReferenceAudioSeconds: 6,
  maxReferenceAudioSeconds: 360
};

const murekaCapabilities: ProviderCapabilities = {
  name: "mureka",
  supportsHummingMelody: true,
  supportsSongExtend: true,
  extendIsApproximate: false,
  supportsCommercialUse: "unknown",
  minReferenceAudioSeconds: 5,
  maxReferenceAudioSeconds: 60
};

describe("provider capabilities", () => {
  it("models MiniMax as approximate for extension", () => {
    expect(minimaxCapabilities.supportsSongExtend).toBe(false);
    expect(minimaxCapabilities.extendIsApproximate).toBe(true);
  });

  it("models Mureka as the precise extension provider", () => {
    expect(murekaCapabilities.supportsSongExtend).toBe(true);
    expect(murekaCapabilities.extendIsApproximate).toBe(false);
  });
});
