import { useEffect, useMemo, useRef, useState } from "react";
import { Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { JobDetail, PublicAppConfig, SongBrief, SongLanguage, VocalGender } from "@demo2song/shared";
import "./index.scss";

const API_BASE = __API_BASE__;
const recorder = Taro.getRecorderManager();

type GenerationState = "idle" | "recorded" | "uploading" | "queued" | "generating" | "ready" | "failed";
type Screen = "record" | "details" | "result";

const styleOptions = ["流行", "抒情", "民谣", "R&B", "摇滚", "电子", "古风"];
const moodOptions = ["温暖", "治愈", "忧伤", "热血", "浪漫", "梦幻"];

const languageOptions: Array<{ label: string; value: SongLanguage }> = [
  { label: "自动", value: "auto" },
  { label: "中文", value: "zh" },
  { label: "英文", value: "en" }
];

const genderOptions: Array<{ label: string; value: VocalGender }> = [
  { label: "自动", value: "auto" },
  { label: "女声", value: "female" },
  { label: "男声", value: "male" },
  { label: "混合", value: "mixed" }
];

const noteGlyphs = ["♪", "♫", "♬", "♩"];
const noteVariants = ["note-a", "note-b", "note-c"];

interface FloatingNote {
  id: number;
  glyph: string;
  variant: string;
  left: number;
  size: number;
}

const DEFAULT_STYLE = "流行，自然真诚的人声";

export default function IndexPage() {
  const [userId, setUserId] = useState<string>();
  const [screen, setScreen] = useState<Screen>("record");
  const [state, setState] = useState<GenerationState>("idle");

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordingPath, setRecordingPath] = useState<string>();
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [notes, setNotes] = useState<FloatingNote[]>([]);

  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewAudioRef = useRef<Taro.InnerAudioContext>();

  const [styleSel, setStyleSel] = useState<string[]>([]);
  const [moodSel, setMoodSel] = useState<string[]>([]);
  const [languageIndex, setLanguageIndex] = useState(0);
  const [genderIndex, setGenderIndex] = useState(0);
  const [description, setDescription] = useState("");
  const [lyricSeed, setLyricSeed] = useState("");

  const [jobId, setJobId] = useState<string>();
  const [songId, setSongId] = useState<string>();
  const [song, setSong] = useState<SongBrief>();
  const [error, setError] = useState<string>();
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>({
    minRecordingSeconds: 6,
    maxRecordingSeconds: 60,
    demoTargetSeconds: 30,
    enableExtendSong: false
  });

  const recordingStartedAt = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const noteRef = useRef<ReturnType<typeof setInterval>>();
  const noteId = useRef(0);
  const configRef = useRef(publicConfig);
  configRef.current = publicConfig;
  const audioRef = useRef<Taro.InnerAudioContext>();

  const waveBars = useMemo(
    () => Array.from({ length: 40 }, () => 12 + Math.round(Math.random() * 40)),
    [recordingPath]
  );

  useEffect(() => {
    request<PublicAppConfig>("/config/public")
      .then(setPublicConfig)
      .catch(() => undefined);

    Taro.login({
      success: async ({ code }) => {
        try {
          const response = await request<{ userId: string }>("/auth/wechat-login", {
            method: "POST",
            data: { code }
          });
          setUserId(response.userId);
        } catch {
          setError("微信登录失败");
        }
      },
      fail: () => setError("微信登录失败")
    });

    recorder.onStop((result) => {
      clearTimers();
      setRecording(false);
      setNotes([]);
      const duration = Math.round((Date.now() - recordingStartedAt.current) / 1000);
      if (duration < configRef.current.minRecordingSeconds) {
        setState("idle");
        setElapsed(0);
        Taro.showToast({ title: `至少哼 ${configRef.current.minRecordingSeconds} 秒`, icon: "none" });
        return;
      }
      setRecordingPath(result.tempFilePath);
      setRecordingDuration(duration);
      setState("recorded");
      setScreen("details");
    });

    recorder.onError(() => {
      clearTimers();
      setRecording(false);
      setNotes([]);
      setState("failed");
      setError("录音失败，请检查麦克风权限");
    });

    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (!jobId || !userId || state === "ready" || state === "failed") {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const job = await request<JobDetail>(`/jobs/${jobId}`, {
          header: { "x-user-id": userId }
        });
        if (job.status === "running") {
          setState("generating");
        }
        if (job.status === "failed") {
          setState("failed");
          setError(job.errorMessage || "生成失败");
        }
        if (job.status === "succeeded" && job.songId) {
          const nextSong = await request<SongBrief>(`/songs/${job.songId}`, {
            header: { "x-user-id": userId }
          });
          setSong(nextSong);
          setState("ready");
        }
      } catch (pollError) {
        setState("failed");
        setError(pollError instanceof Error ? pollError.message : "查询任务失败");
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [jobId, state, userId]);

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (noteRef.current) clearInterval(noteRef.current);
  }

  function spawnNote() {
    const id = noteId.current++;
    const note: FloatingNote = {
      id,
      glyph: noteGlyphs[Math.floor(Math.random() * noteGlyphs.length)],
      variant: noteVariants[id % noteVariants.length],
      left: 38 + Math.random() * 24,
      size: 36 + Math.round(Math.random() * 36)
    };
    setNotes((prev) => [...prev, note]);
    setTimeout(() => {
      setNotes((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  }

  function startRecord() {
    if (recording) return;
    setError(undefined);
    setSong(undefined);
    recordingStartedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    setState("idle");
    recorder.start({
      duration: configRef.current.maxRecordingSeconds * 1000,
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 192000,
      format: "mp3"
    });
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - recordingStartedAt.current) / 1000);
    }, 100);
    noteRef.current = setInterval(spawnNote, 280);
  }

  function stopRecord() {
    if (!recording) return;
    clearTimers();
    recorder.stop();
  }

  function resetToRecord() {
    stopPreview();
    setScreen("record");
    setState("idle");
    setRecordingPath(undefined);
    setRecordingDuration(0);
    setElapsed(0);
    setNotes([]);
    setSong(undefined);
    setJobId(undefined);
    setSongId(undefined);
    setError(undefined);
  }

  function toggleStyle(value: string) {
    setStyleSel((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  function toggleMood(value: string) {
    setMoodSel((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  function stopPreview() {
    previewAudioRef.current?.stop();
    previewAudioRef.current?.destroy();
    previewAudioRef.current = undefined;
    setPreviewing(false);
    setPreviewProgress(0);
  }

  function previewRecording() {
    if (!recordingPath) return;
    if (previewing) {
      stopPreview();
      return;
    }
    const audio = Taro.createInnerAudioContext();
    previewAudioRef.current = audio;
    audio.src = recordingPath;
    audio.onPlay(() => setPreviewing(true));
    audio.onTimeUpdate(() => {
      const total = audio.duration || recordingDuration || 1;
      setPreviewProgress(Math.min(1, audio.currentTime / total));
    });
    audio.onEnded(() => {
      setPreviewing(false);
      setPreviewProgress(0);
    });
    audio.onStop(() => setPreviewing(false));
    audio.onError(() => {
      setPreviewing(false);
      setPreviewProgress(0);
    });
    audio.play();
  }

  async function submitDemo() {
    if (!userId || !recordingPath) return;

    stopPreview();
    setScreen("result");
    setState("uploading");
    setError(undefined);
    try {
      const uploadResult = await Taro.uploadFile({
        url: `${API_BASE}/recordings`,
        filePath: recordingPath,
        name: "file",
        formData: { durationSeconds: String(recordingDuration) },
        header: { "x-user-id": userId }
      });
      if (uploadResult.statusCode >= 400) {
        throw new Error(uploadResult.data);
      }
      const recording = JSON.parse(uploadResult.data) as { id: string };

      const job = await request<{ jobId: string; songId: string }>("/songs/demo-jobs", {
        method: "POST",
        header: { "x-user-id": userId },
        data: {
          recordingId: recording.id,
          prompt: {
            style: styleSel.length ? styleSel.join("，") : DEFAULT_STYLE,
            mood: moodSel.length ? moodSel.join("，") : undefined,
            language: languageOptions[languageIndex].value,
            vocalGender: genderOptions[genderIndex].value,
            description: description || undefined,
            lyricSeed: lyricSeed || undefined
          }
        }
      });

      setJobId(job.jobId);
      setSongId(job.songId);
      setState("queued");
    } catch (submitError) {
      setState("failed");
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    }
  }

  async function requestExtend() {
    if (!songId || !userId) return;
    try {
      const job = await request<{ jobId: string; songId: string }>("/songs/" + songId + "/extend-jobs", {
        method: "POST",
        header: { "x-user-id": userId }
      });
      setJobId(job.jobId);
      setSongId(job.songId);
      setState("queued");
    } catch (extendError) {
      setError(extendError instanceof Error ? extendError.message : "扩歌暂不可用");
    }
  }

  function playSong() {
    if (!song?.playbackUrl) return;
    audioRef.current?.destroy();
    audioRef.current = Taro.createInnerAudioContext();
    audioRef.current.src = song.playbackUrl;
    audioRef.current.play();
  }

  const generating = state === "uploading" || state === "queued" || state === "generating";

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />

      {screen === "record" ? (
        <View className="screen record-screen">
          <View className="brand">
            <Text className="brand-title">哼一段，变成歌</Text>
            <Text className="brand-sub">按住下面的麦克风，哼出你的旋律</Text>
          </View>

          <View className="stage">
            <View className="notes-layer">
              {notes.map((note) => (
                <View
                  key={note.id}
                  className={`note ${note.variant}`}
                  style={{ left: `${note.left}%`, fontSize: Taro.pxTransform(note.size) }}
                >
                  {note.glyph}
                </View>
              ))}
            </View>

            <View className={`mic-wrap ${recording ? "recording" : ""}`}>
              <View className="halo" />
              <View className="ripple ripple-1" />
              <View className="ripple ripple-2" />
              <View className="ripple ripple-3" />
              <View
                className={`mic-btn ${recording ? "pressing" : ""}`}
                onTouchStart={startRecord}
                onTouchEnd={stopRecord}
                onTouchCancel={stopRecord}
              >
                <View className="mic-glyph">
                  <View className="mic-head" />
                  <View className="mic-cradle" />
                  <View className="mic-stem" />
                  <View className="mic-base" />
                </View>
              </View>
              <View className="eq">
                {Array.from({ length: 10 }).map((_, index) => (
                  <View key={index} className="eq-bar" />
                ))}
              </View>
            </View>
          </View>

          <View className="record-foot">
            <Text className={`timer ${recording ? "show" : ""}`}>
              {elapsed.toFixed(1)}
              <Text className="timer-unit">s</Text>
            </Text>
            <Text className="hint">{recording ? "正在聆听你的旋律…" : "按住开始 · 松开结束"}</Text>
            <Text className="press-label">🎤 按住录音</Text>
            <Text className="sub-hint">
              建议 {publicConfig.minRecordingSeconds}–{publicConfig.maxRecordingSeconds} 秒，先哼主歌或副歌都可以
            </Text>
          </View>
        </View>
      ) : null}

      {screen === "details" ? (
        <View className="screen details-screen">
          <View className="d-head">
            <Text className="d-title">完善歌曲信息</Text>
            <Text className="d-desc">
              下面的内容<Text className="d-strong">全部可选</Text>。什么都不填也行，我们会根据你的哼唱自动创作 🎶
            </Text>
          </View>

          <View className="playback">
            <View className="play-btn" onClick={previewRecording}>
              {previewing ? (
                <View className="pause-icon">
                  <View className="bar" />
                  <View className="bar" />
                </View>
              ) : (
                <View className="play-triangle" />
              )}
            </View>
            <View className="pb-mid">
              <View className={`pb-wave ${previewing ? "playing" : ""}`}>
                {waveBars.map((height, index) => (
                  <View
                    key={index}
                    className={`pb-wave-bar ${index / waveBars.length <= previewProgress ? "played" : ""}`}
                    style={{ height: Taro.pxTransform(height) }}
                  />
                ))}
              </View>
              <Text className="pb-meta">
                {previewing ? "正在播放…" : "我的哼唱"} · {recordingDuration} 秒
              </Text>
            </View>
            <View className="rerecord" onClick={resetToRecord}>
              重新录制
            </View>
          </View>

          <View className="field">
            <View className="field-label">
              <Text>曲风</Text>
              <Text className="optional-tag">可选</Text>
            </View>
            <View className="chips">
              {styleOptions.map((option) => (
                <View
                  key={option}
                  className={`chip ${styleSel.includes(option) ? "active" : ""}`}
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
                  className={`chip ${moodSel.includes(option) ? "active" : ""}`}
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
                  className={`seg-item ${languageIndex === index ? "active" : ""}`}
                  onClick={() => setLanguageIndex(index)}
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
                  className={`seg-item ${genderIndex === index ? "active" : ""}`}
                  onClick={() => setGenderIndex(index)}
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
              value={description}
              placeholder="例如：写给毕业那年的夏天，关于离别和期待…"
              onInput={(event) => setDescription(event.detail.value)}
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
              value={lyricSeed}
              placeholder="有想好的词可以写在这里，我们会帮你扩展成完整歌词"
              onInput={(event) => setLyricSeed(event.detail.value)}
            />
          </View>

          <View className="actions">
            <View className="primary" onClick={submitDemo}>
              生成 {publicConfig.demoTargetSeconds} 秒 demo
            </View>
            <View className="ghost" onClick={resetToRecord}>
              ← 返回重新录制
            </View>
          </View>
        </View>
      ) : null}

      {screen === "result" ? (
        <View className="screen result-screen">
          {generating ? (
            <>
              <View className="spinner" />
              <Text className="result-title">正在为你创作…</Text>
              <Text className="result-desc">AI 正在把你的哼唱变成一首歌，大约需要 20–40 秒</Text>
            </>
          ) : null}

          {state === "ready" && song ? (
            <>
              <Text className="result-title">完成！</Text>
              <Text className="result-desc">点击播放，听听你的 demo</Text>
              <View className="result-card">
                <View className="result-play" onClick={playSong}>
                  <View className="play-triangle" />
                </View>
                <Text className="result-song-title">{song.title || "你的 demo 已生成"} 🎉</Text>
                <Text className="result-song-meta">
                  {song.durationSeconds ? `${song.durationSeconds} 秒` : `${publicConfig.demoTargetSeconds} 秒`}
                  {styleSel.length ? ` · ${styleSel.join("，")}` : ""}
                </Text>
                {publicConfig.enableExtendSong ? (
                  <View className="result-extra">
                    <View className="secondary" onClick={requestExtend}>
                      扩成完整歌
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {state === "failed" ? (
            <>
              <Text className="result-title">出了点问题</Text>
              <Text className="error-text">{error || "生成失败，请重试"}</Text>
              <View className="result-card">
                <View className="result-extra">
                  <View className="secondary" onClick={submitDemo}>
                    重试
                  </View>
                </View>
              </View>
            </>
          ) : null}

          <View className="back-link" onClick={resetToRecord}>
            ← 再哼一首
          </View>
        </View>
      ) : null}
    </View>
  );
}

type ApiRequestOptions = Omit<Taro.request.Option, "url">;

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await Taro.request<T>({
    url: `${API_BASE}${path}`,
    ...options,
    header: {
      "content-type": "application/json",
      ...(options.header || {})
    }
  });
  if (response.statusCode >= 400) {
    throw new Error(typeof response.data === "string" ? response.data : JSON.stringify(response.data));
  }
  return response.data;
}
