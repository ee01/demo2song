import type { SongLanguage, SongPromptInput, VocalGender } from "@demo2song/shared";

export const styleOptions = ["流行", "抒情", "民谣", "R&B", "摇滚", "电子", "古风"];
export const moodOptions = ["温暖", "治愈", "忧伤", "热血", "浪漫", "梦幻"];

export const languageOptions: Array<{ label: string; value: SongLanguage }> = [
  { label: "自动", value: "auto" },
  { label: "中文", value: "zh" },
  { label: "英文", value: "en" }
];

export const genderOptions: Array<{ label: string; value: VocalGender }> = [
  { label: "自动", value: "auto" },
  { label: "女声", value: "female" },
  { label: "男声", value: "male" },
  { label: "混合", value: "mixed" }
];

export const DEFAULT_STYLE = "流行，自然真诚的人声";

export interface PromptForm {
  styleSel: string[];
  moodSel: string[];
  languageIndex: number;
  genderIndex: number;
  description: string;
  lyricSeed: string;
  title: string;
  lyrics: string;
}

export function emptyPromptForm(): PromptForm {
  return {
    styleSel: [],
    moodSel: [],
    languageIndex: 0,
    genderIndex: 0,
    description: "",
    lyricSeed: "",
    title: "",
    lyrics: ""
  };
}

export function promptFormToInput(form: PromptForm): SongPromptInput {
  return {
    style: form.styleSel.length ? form.styleSel.join("，") : DEFAULT_STYLE,
    mood: form.moodSel.length ? form.moodSel.join("，") : undefined,
    language: languageOptions[form.languageIndex].value,
    vocalGender: genderOptions[form.genderIndex].value,
    description: form.description || undefined,
    lyricSeed: form.lyricSeed || undefined
  };
}

export function inputToPromptForm(prompt?: Partial<SongPromptInput>): PromptForm {
  const form = emptyPromptForm();
  if (!prompt) {
    return form;
  }
  if (prompt.style) {
    form.styleSel = prompt.style
      .split("，")
      .map((item) => item.trim())
      .filter((item) => styleOptions.includes(item));
  }
  if (prompt.mood) {
    form.moodSel = prompt.mood
      .split("，")
      .map((item) => item.trim())
      .filter((item) => moodOptions.includes(item));
  }
  if (prompt.language) {
    const idx = languageOptions.findIndex((item) => item.value === prompt.language);
    if (idx >= 0) form.languageIndex = idx;
  }
  if (prompt.vocalGender) {
    const idx = genderOptions.findIndex((item) => item.value === prompt.vocalGender);
    if (idx >= 0) form.genderIndex = idx;
  }
  form.description = prompt.description ?? "";
  form.lyricSeed = prompt.lyricSeed ?? "";
  return form;
}
