import type { MusicProvider, ProviderName } from "@demo2song/shared";
import { MiniMaxProvider } from "./minimax.js";
import { MurekaProvider } from "./mureka.js";

export function createProvider(provider: ProviderName): MusicProvider {
  if (provider === "minimax") {
    return new MiniMaxProvider();
  }
  return new MurekaProvider();
}
