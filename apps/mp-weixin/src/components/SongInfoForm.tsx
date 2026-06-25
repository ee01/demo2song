import { Text, Textarea, View } from "@tarojs/components";
import { genderOptions, languageOptions, moodOptions, styleOptions, type PromptForm } from "../constants";

interface SongInfoFormProps {
  value: PromptForm;
  onChange: (next: PromptForm) => void;
}

export default function SongInfoForm({ value, onChange }: SongInfoFormProps) {
  function toggleStyle(option: string) {
    const styleSel = value.styleSel.includes(option)
      ? value.styleSel.filter((item) => item !== option)
      : [...value.styleSel, option];
    onChange({ ...value, styleSel });
  }

  function toggleMood(option: string) {
    const moodSel = value.moodSel.includes(option)
      ? value.moodSel.filter((item) => item !== option)
      : [...value.moodSel, option];
    onChange({ ...value, moodSel });
  }

  return (
    <View>
      <View className="field">
        <View className="field-label">
          <Text>曲风</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <View className="chips">
          {styleOptions.map((option) => (
            <View
              key={option}
              className={`chip ${value.styleSel.includes(option) ? "active" : ""}`}
              onClick={() => toggleStyle(option)}
            >
              {option}
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <View className="field-label">
          <Text>情绪</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <View className="chips">
          {moodOptions.map((option) => (
            <View
              key={option}
              className={`chip ${value.moodSel.includes(option) ? "active" : ""}`}
              onClick={() => toggleMood(option)}
            >
              {option}
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <View className="field-label">
          <Text>语言</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <View className="segmented">
          {languageOptions.map((option, index) => (
            <View
              key={option.value}
              className={`seg-item ${value.languageIndex === index ? "active" : ""}`}
              onClick={() => onChange({ ...value, languageIndex: index })}
            >
              {option.label}
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <View className="field-label">
          <Text>人声</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <View className="segmented">
          {genderOptions.map((option, index) => (
            <View
              key={option.value}
              className={`seg-item ${value.genderIndex === index ? "active" : ""}`}
              onClick={() => onChange({ ...value, genderIndex: index })}
            >
              {option.label}
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <View className="field-label">
          <Text>主题 / 想表达的故事</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <Textarea
          className="ta"
          placeholderClass="ta-placeholder"
          value={value.description}
          placeholder="例如：写给毕业那年的夏天，关于离别和期待…"
          onInput={(event) => onChange({ ...value, description: event.detail.value })}
        />
      </View>

      <View className="field">
        <View className="field-label">
          <Text>歌词片段</Text>
          <Text className="optional-tag">可选</Text>
        </View>
        <Textarea
          className="ta"
          placeholderClass="ta-placeholder"
          value={value.lyricSeed}
          placeholder="有想好的词可以写在这里，我们会帮你扩展成完整歌词"
          onInput={(event) => onChange({ ...value, lyricSeed: event.detail.value })}
        />
      </View>
    </View>
  );
}
