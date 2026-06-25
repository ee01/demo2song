import type {
  CreateDemoSongInput,
  ExtendSongInput,
  MusicProvider,
  NormalizedProviderError,
  ProviderCapabilities,
  ProviderSongResult
} from "@demo2song/shared";
import { loadValidatedConfig } from "@demo2song/config";
import { env } from "../env.js";

interface MiniMaxMusicResponse {
  data?: {
    audio?: string;
    audio_url?: string;
    status?: number;
  };
  trace_id?: string;
  extra_info?: {
    music_duration?: number;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

const config = loadValidatedConfig();

export class MiniMaxProvider implements MusicProvider {
  getCapabilities(): ProviderCapabilities {
    return {
      name: "minimax",
      supportsHummingMelody: true,
      supportsSongExtend: false,
      extendIsApproximate: true,
      supportsCommercialUse: "unknown",
      minReferenceAudioSeconds: 6,
      maxReferenceAudioSeconds: 360
    };
  }

  async createDemoSong(input: CreateDemoSongInput): Promise<ProviderSongResult> {
    return this.generateWithReference(input.recording, input.prompt.style, input.expandedLyrics);
  }

  async extendSong(input: ExtendSongInput): Promise<ProviderSongResult> {
    return this.generateWithReference(input.demoSong, input.prompt.style, input.expandedLyrics);
  }

  normalizeError(error: unknown): NormalizedProviderError {
    return {
      code: "MINIMAX_ERROR",
      message: error instanceof Error ? error.message : "MiniMax provider error",
      retryable: true,
      raw: error
    };
  }

  private async generateWithReference(
    audio: CreateDemoSongInput["recording"],
    style: string,
    lyrics: string
  ): Promise<ProviderSongResult> {
    if (env.PROVIDER_MOCK_MODE) {
      return {
        provider: "minimax",
        providerTaskId: `mock-minimax-${Date.now()}`,
        audioBase64: audio.audioBase64 ?? Buffer.from("mock audio").toString("base64"),
        mimeType: "audio/mpeg",
        durationSeconds: audio.durationSeconds,
        lyrics,
        raw: { mock: true }
      };
    }

    if (!env.MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is required");
    }

    const model = config.models.minimax.demoModel;
    const referenceAudio =
      audio.audioBase64 && audio.audioBase64.length > 0
        ? { audio_base64: audio.audioBase64 }
        : { audio_url: audio.signedUrl };
    const response = await fetch("https://api.minimax.io/v1/music_generation", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: style.length >= 10 ? style : `${style} vocal song from humming reference`,
        lyrics: lyrics.slice(0, 1000),
        output_format: "hex",
        ...referenceAudio,
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: "mp3"
        }
      })
    });

    const data = (await response.json()) as MiniMaxMusicResponse;
    if (!response.ok || data.base_resp?.status_code) {
      throw new Error(data.base_resp?.status_msg || `MiniMax HTTP ${response.status}`);
    }

    return {
      provider: "minimax",
      providerTaskId: data.trace_id,
      audioHex: data.data?.audio,
      audioUrl: data.data?.audio_url,
      mimeType: "audio/mpeg",
      durationSeconds: data.extra_info?.music_duration
        ? Math.ceil(data.extra_info.music_duration / 1000)
        : undefined,
      lyrics,
      raw: data
    };
  }
}
