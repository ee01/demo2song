import type { SongPromptInput } from "@demo2song/shared";

export function expandLyrics(prompt: SongPromptInput): string {
  const languageHint = prompt.language === "en" ? "English" : "中文";
  const seed = prompt.lyricSeed?.trim();
  const topic = prompt.description?.trim() || "把这段旋律里的情绪写成一首歌";
  const mood = prompt.mood ? `情绪：${prompt.mood}` : "情绪：自然真诚";
  const style = `曲风：${prompt.style}`;

  if (seed) {
    return [
      `[${languageHint}]`,
      style,
      mood,
      "请将下面歌词片段扩展为适合主歌-副歌结构的人声歌词，保留核心意象：",
      seed,
      "",
      "结构：Verse 1 / Pre-Chorus / Chorus / Verse 2 / Chorus"
    ].join("\n");
  }

  return [
    `[${languageHint}]`,
    style,
    mood,
    `主题：${topic}`,
    "请生成适合哼唱旋律节奏的人声歌词。",
    "结构：Verse 1 / Pre-Chorus / Chorus / Verse 2 / Chorus"
  ].join("\n");
}
