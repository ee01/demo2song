import { Input, Text, Textarea, View } from "@tarojs/components";
import { genderOptions, languageOptions, moodOptions, styleOptions, type PromptForm } from "../constants";

type GeneratedContentField = "title" | "lyrics";

interface SongInfoFormProps {
  value: PromptForm;
  onChange: (next: PromptForm) => void;
  showGeneratedContent?: boolean;
  generatingContent?: boolean;
  onGeneratedContentEdit?: (field: GeneratedContentField) => void;
}

export default function SongInfoForm({
  value,
  onChange,
  showGeneratedContent = false,
  generatingContent = false,
  onGeneratedContentEdit
}: SongInfoFormProps) {
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
      {showGeneratedContent ? (
        <>
          <View className="field">
            <View className="field-label">
              <Text>歌曲标题</Text>
              <Text className="optional-tag">可修改</Text>
              {generatingContent ? (
                <View className="ai-generating">
                  <View className="ai-generating-spinner" />
                  <Text>生成中</Text>
                </View>
              ) : null}
            </View>
            <Input
              className="text-input"
              value={value.title}
              maxlength={80}
              placeholder="AI 正在构思歌名，也可以直接填写"
              placeholderClass="ta-placeholder"
              onInput={(event) => {
                onGeneratedContentEdit?.("title");
                onChange({ ...value, title: event.detail.value });
              }}
            />
          </View>

          <View className="field">
            <View className="field-label">
              <Text>完整歌词</Text>
              <Text className="optional-tag">可修改</Text>
              {generatingContent ? (
                <View className="ai-generating">
                  <View className="ai-generating-spinner" />
                  <Text>生成中</Text>
                </View>
              ) : null}
            </View>
            <Textarea
              className="ta lyrics-input"
              placeholderClass="ta-placeholder"
              value={value.lyrics}
              maxlength={3500}
              placeholder="AI 正在创作完整歌词，也可以直接填写"
              onInput={(event) => {
                onGeneratedContentEdit?.("lyrics");
                onChange({ ...value, lyrics: event.detail.value });
              }}
            />
          </View>
        </>
      ) : null}

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
