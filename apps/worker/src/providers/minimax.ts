import type {
  CreateDemoSongInput,
  CreateFullSongInput,
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
    // music-cover: 跟随哼唱旋律的翻唱，输出时长≈参考音频时长
    return this.generateWithReference(
      config.models.minimax.demoModel,
      input.recording,
      input.prompt.style,
      input.lyrics
    );
  }

  async createFullSong(input: CreateFullSongInput): Promise<ProviderSongResult> {
    // music-2.6 / music-3.0: 按歌词重生成完整歌曲，不再把哼唱当参考音频传入
    return this.generateWithReference(
      config.models.minimax.fullModel,
      input.recording,
      input.prompt.style,
      input.lyrics
    );
  }

  normalizeError(error: unknown): NormalizedProviderError {
    const message = error instanceof Error ? error.message : "MiniMax provider error";
    return {
      code: "MINIMAX_ERROR",
      message: userFacingMiniMaxMessage(message),
      retryable: true,
      raw: error
    };
  }

  private async generateWithReference(
    model: string,
    audio: CreateDemoSongInput["recording"],
    style: string,
    lyrics?: string
  ): Promise<ProviderSongResult> {
    if (env.PROVIDER_MOCK_MODE) {
      return {
        provider: "minimax",
        providerTaskId: `mock-minimax-${Date.now()}`,
        audioBase64: audio.audioBase64 ?? Buffer.from("mock audio").toString("base64"),
        mimeType: "audio/mpeg",
        durationSeconds: audio.durationSeconds,
        lyrics,
        raw: { mock: true, model }
      };
    }

    if (!env.MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is required");
    }

    const normalizedLyrics = lyrics?.trim();
    const isCoverModel = model.startsWith("music-cover");
    const lyricsInput = normalizedLyrics
      ? { lyrics: normalizedLyrics.slice(0, isCoverModel ? 1000 : 3500) }
      : isCoverModel
        ? {}
        : { lyrics_optimizer: true };
    const referenceAudio = isCoverModel ? coverReferenceAudio(audio) : {};
    const response = await fetch(`${env.MINIMAX_API_BASE}/v1/music_generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: style.length >= 10 ? style : `${style} vocal song from humming reference`,
        ...lyricsInput,
        output_format: "url",
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

    const outputAudio = data.data?.audio;
    const outputUrl = data.data?.audio_url ?? (outputAudio?.startsWith("http") ? outputAudio : undefined);
    const outputHex = outputUrl ? undefined : outputAudio;

    return {
      provider: "minimax",
      providerTaskId: data.trace_id,
      audioHex: outputHex,
      audioUrl: outputUrl,
      mimeType: "audio/mpeg",
      durationSeconds: data.extra_info?.music_duration
        ? Math.ceil(data.extra_info.music_duration / 1000)
        : undefined,
      lyrics: normalizedLyrics,
      raw: {
        trace_id: data.trace_id,
        data: {
          status: data.data?.status,
          audio_url: outputUrl,
          audio_size_bytes: outputHex ? Math.floor(outputHex.length / 2) : undefined
        },
        extra_info: data.extra_info,
        base_resp: data.base_resp
      }
    };
  }
}

function coverReferenceAudio(audio: CreateDemoSongInput["recording"]): { audio_base64: string } | { audio_url: string } {
  if (audio.audioBase64 && audio.audioBase64.length > 0) {
    return { audio_base64: audio.audioBase64 };
  }
  if (audio.signedUrl) {
    return { audio_url: audio.signedUrl };
  }
  throw new Error("Cover generation requires reference audio");
}

function userFacingMiniMaxMessage(message: string): string {
  if (/no longer available to new users|status_code"?\s*:\s*2153/i.test(message)) {
    return "MiniMax 免费音乐接口已下线，请改用付费模型后重试";
  }
  if (/cover mode does not support instrumental/i.test(message)) {
    return "哼唱中没有识别到人声，请对着麦克风唱几句再试";
  }
  if (/audio duration must be between/i.test(message)) {
    return "参考音频时长需要在 6 秒到 6 分钟之间";
  }
  if (/invalid params, invalid audio file/i.test(message)) {
    return "参考音频无法被识别，请重新录制后再试";
  }
  if (/download audio_url failed/i.test(message)) {
    return "参考音频地址无法被生成服务访问，请重试";
  }
  if (/usage limit reached|insufficient balance/i.test(message)) {
    return "音乐生成额度不足，请稍后重试";
  }
  return message;
}
