import config from "../../../packages/config/config/demo2song.config.json";
import type { SongLanguage, SongPromptInput, VocalGender } from "@demo2song/shared";

export const styleOptions = config.options.styles;
export const moodOptions = config.options.moods;
export const languageOptions = config.options.languages as Array<{ label: string; value: SongLanguage }>;
export const genderOptions = config.options.genders as Array<{ label: string; value: VocalGender }>;

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
