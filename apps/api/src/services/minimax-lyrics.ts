import type { SongPromptInput } from "@demo2song/shared";
import { env } from "../env.js";

interface MiniMaxLyricsResponse {
  song_title?: string;
  style_tags?: string;
  lyrics?: string;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

interface GenerateLyricsOptions {
  apiKey?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GeneratedLyricsDraft {
  title: string;
  lyrics: string;
  styleTags?: string;
}

const languageLabels: Record<SongPromptInput["language"], string> = {
  zh: "中文",
  en: "英文",
  ja: "日文",
  ko: "韩文",
  auto: "根据主题自动选择，未指定时优先中文"
};

const vocalLabels: Record<SongPromptInput["vocalGender"], string> = {
  female: "女声",
  male: "男声",
  mixed: "混合人声",
  auto: "自动选择"
};

export function buildLyricsPrompt(prompt: SongPromptInput): string {
  const lines = [
    "为这首即将生成的完整歌曲创作一个简洁、有记忆点的歌名和一套可直接演唱的完整歌词。",
    `曲风：${prompt.style}`,
    `语言：${languageLabels[prompt.language]}`,
    `人声：${vocalLabels[prompt.vocalGender]}`
  ];

  if (prompt.mood?.trim()) {
    lines.push(`情绪：${prompt.mood.trim()}`);
  }
  if (prompt.description?.trim()) {
    lines.push(`主题与故事：${prompt.description.trim()}`);
  }
  if (prompt.lyricSeed?.trim()) {
    lines.push(`必须保留并自然扩展的歌词片段：${prompt.lyricSeed.trim()}`);
  }

  lines.push("歌词使用清晰的段落标签，包含主歌、副歌，并适合扩展成两分钟以上的歌曲。");
  return lines.join("\n").slice(0, 2000);
}

export async function generateLyricsDraft(
  prompt: SongPromptInput,
  options: GenerateLyricsOptions = {}
): Promise<GeneratedLyricsDraft> {
  const apiKey = options.apiKey ?? env.MINIMAX_API_KEY;
  const apiBase = (options.apiBase ?? env.MINIMAX_API_BASE).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 55_000;

  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is required for lyrics generation");
  }

  // lyrics_generation 当前没有 model 参数，也没有可指定的 *-free 模型。
  const response = await fetchImpl(`${apiBase}/v1/lyrics_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      mode: "write_full_song",
      prompt: buildLyricsPrompt(prompt)
    })
  });
  const data = (await response.json()) as MiniMaxLyricsResponse;

  if (!response.ok || data.base_resp?.status_code) {
    throw new Error(data.base_resp?.status_msg || `MiniMax lyrics HTTP ${response.status}`);
  }

  const title = data.song_title?.trim();
  const lyrics = data.lyrics?.trim();
  if (!title || !lyrics) {
    throw new Error("MiniMax lyrics response is missing title or lyrics");
  }

  return {
    title,
    lyrics,
    styleTags: data.style_tags?.trim() || undefined
  };
}
