import { useEffect, useRef, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import type { JobDetail, PublicAppConfig, SongBrief } from "@demo2song/shared";
import SongInfoForm from "../../components/SongInfoForm";
import PlayerCard from "../../components/PlayerCard";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { emptyPromptForm, promptFormToInput, type PromptForm } from "../../constants";
import { API_BASE, authHeader, ensureLogin, request, errorMessage } from "../../utils/request";
import { saveSong } from "../../utils/download";
import "./index.scss";

const recorder = Taro.getRecorderManager();

type GenerationState = "idle" | "recorded" | "uploading" | "queued" | "generating" | "ready" | "failed";
type Screen = "record" | "details" | "result";

const noteGlyphs = ["♪", "♫", "♬", "♩"];
const noteVariants = ["note-a", "note-b", "note-c"];

interface FloatingNote {
  id: number;
  glyph: string;
  variant: string;
  left: number;
  size: number;
}

function getNavBottom() {
  try {
    const menu = Taro.getMenuButtonBoundingClientRect?.();
    if (menu && menu.bottom) {
      return Math.round(menu.bottom);
    }
    const sys = Taro.getSystemInfoSync();
    return (sys.statusBarHeight ?? 20) + 44;
  } catch {
    return 64;
  }
}

export default function IndexPage() {
  const [userId, setUserId] = useState<string>();
  const [screen, setScreen] = useState<Screen>("record");
  const [state, setState] = useState<GenerationState>("idle");

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordingPath, setRecordingPath] = useState<string>();
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [notes, setNotes] = useState<FloatingNote[]>([]);

  const [form, setForm] = useState<PromptForm>(emptyPromptForm());

  const [jobId, setJobId] = useState<string>();
  const [song, setSong] = useState<SongBrief>();
  const [error, setError] = useState<string>();
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>({
    minRecordingSeconds: 6,
    maxRecordingSeconds: 60,
    demoTargetSeconds: 30,
    enableFullSong: true
  });

  const recordingStartedAt = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const noteRef = useRef<ReturnType<typeof setInterval>>();
  const noteId = useRef(0);
  const configRef = useRef(publicConfig);
  configRef.current = publicConfig;

  const player = useAudioPlayer();

  const [navBottom] = useState(getNavBottom);

  useShareAppMessage(() => ({
    title: song?.title ? `听听这首《${song.title}》` : "我用哼唱生成了一首歌，你也来试试",
    path: song ? `/pages/play/index?songId=${song.id}` : "/pages/index/index"
  }));

  useEffect(() => {
    request<PublicAppConfig>("/config/public")
      .then(setPublicConfig)
      .catch(() => undefined);

    ensureLogin()
      .then(setUserId)
      .catch((loginError) => setError(errorMessage(loginError, "微信登录失败")));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jobId || !userId || state === "ready" || state === "failed") {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const job = await request<JobDetail>(`/jobs/${jobId}`, { header: authHeader(userId) });
        if (job.status === "running") {
          setState("generating");
        }
        if (job.status === "failed") {
          setState("failed");
          setError(job.errorMessage || "生成失败");
        }
        if (job.status === "succeeded" && job.songId) {
          const nextSong = await request<SongBrief>(`/songs/${job.songId}`, { header: authHeader(userId) });
          setSong(nextSong);
          setState("ready");
        }
      } catch (pollError) {
        setState("failed");
        setError(errorMessage(pollError, "查询任务失败"));
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
    setTimeout(() => setNotes((prev) => prev.filter((item) => item.id !== id)), 3000);
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
    player.stop();
    setScreen("record");
    setState("idle");
    setRecordingPath(undefined);
    setRecordingDuration(0);
    setElapsed(0);
    setNotes([]);
    setSong(undefined);
    setJobId(undefined);
    setError(undefined);
    setForm(emptyPromptForm());
  }

  async function submitDemo() {
    if (!recordingPath || demoSubmitting || generating) return;
    player.stop();
    setDemoSubmitting(true);
    setState("uploading");
    setError(undefined);
    try {
      const uid = userId ?? (await ensureLogin());
      setUserId(uid);
      const uploadResult = await Taro.uploadFile({
        url: `${API_BASE}/recordings`,
        filePath: recordingPath,
        name: "file",
        formData: { durationSeconds: String(recordingDuration) },
        header: authHeader(uid)
      });
      if (uploadResult.statusCode >= 400) {
        throw new Error(uploadResult.data);
      }
      const recordingRes = JSON.parse(uploadResult.data) as { id: string };

      const job = await request<{ jobId: string; songId: string }>("/songs/demo-jobs", {
        method: "POST",
        header: authHeader(uid),
        data: { recordingId: recordingRes.id, prompt: promptFormToInput(form) }
      });

      setJobId(job.jobId);
      setScreen("result");
      setState("queued");
    } catch (submitError) {
      setState("failed");
      setError(errorMessage(submitError, "提交失败"));
    } finally {
      setDemoSubmitting(false);
    }
  }

  function goFull() {
    if (!song) return;
    player.stop();
    Taro.navigateTo({ url: `/pages/full/index?demoId=${song.id}` });
  }

  function openLibrary() {
    player.stop();
    Taro.navigateTo({ url: "/pages/library/index" });
  }

  const generating = state === "uploading" || state === "queued" || state === "generating";

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />

      {screen === "record" ? (
        <View className="screen record-screen" style={{ paddingTop: `${navBottom + 16}px` }}>
          <View className="user-entry" onClick={openLibrary} style={{ top: `${navBottom + 8}px` }}>
            <View className="u-col">
              <View className="u-head" />
              <View className="u-body" />
            </View>
          </View>

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
        <View className="screen details-screen" style={{ paddingTop: `${navBottom + 24}px` }}>
          <View className="head">
            <Text className="head-title">完善歌曲信息</Text>
            <Text className="head-desc">
              下面的内容<Text className="head-strong">全部可选</Text>。什么都不填也行，我们会根据你的哼唱自动创作 🎶
            </Text>
          </View>

          <View style={{ marginBottom: Taro.pxTransform(44) }}>
            <PlayerCard player={player} url={recordingPath} title="我的哼唱" subtitle={`${recordingDuration} 秒`}>
              <View className="rerecord" onClick={resetToRecord}>
                重新录制
              </View>
            </PlayerCard>
          </View>

          <SongInfoForm value={form} onChange={setForm} />

          {error ? <Text className="error-text">{error}</Text> : null}

          <View className="actions">
            <View className={`primary ${demoSubmitting ? "loading disabled" : ""}`} onClick={submitDemo}>
              {demoSubmitting ? (
                <View className="btn-loading">
                  <View className="btn-spinner" />
                  <Text>{state === "uploading" ? "上传中…" : "提交中…"}</Text>
                </View>
              ) : (
                "生成 demo"
              )}
            </View>
            <View className="ghost" onClick={resetToRecord}>
              ← 返回重新录制
            </View>
          </View>
        </View>
      ) : null}

      {screen === "result" ? (
        <View className="screen result-screen" style={{ paddingTop: `${navBottom + 24}px` }}>
          {generating ? (
            <View className="center-block">
              <View className="spinner" />
              <Text className="head-title">正在为你创作…</Text>
              <Text className="head-desc">AI 正在把你的哼唱变成一首歌，请稍候</Text>
            </View>
          ) : null}

          {state === "ready" && song ? (
            <View className="result-body">
              <Text className="head-title">完成！🎉</Text>
              <Text className="head-desc">这是你的 demo，满意的话可以生成完整版</Text>

              <View style={{ marginTop: Taro.pxTransform(28), marginBottom: Taro.pxTransform(20) }}>
                <PlayerCard
                  player={player}
                  url={song.playbackUrl}
                  title={song.title || "我的 demo"}
                  subtitle={song.durationSeconds ? `约 ${song.durationSeconds} 秒` : undefined}
                />
              </View>

              <View className="player-card" onClick={() => player.toggle(recordingPath)} style={{ marginBottom: Taro.pxTransform(28) }}>
                <View className="play-fab">
                  {player.isPlaying(recordingPath) ? (
                    <View className="pause-icon">
                      <View className="bar" />
                      <View className="bar" />
                    </View>
                  ) : (
                    <View className="play-triangle" />
                  )}
                </View>
                <View className="pc-mid">
                  <Text className="pc-meta">{player.isPlaying(recordingPath) ? "正在播放…" : "试听原录音（哼唱）"}</Text>
                </View>
              </View>

              <View className="actions-row">
                <Button className="action-btn" openType="share">
                  分享
                </Button>
                <View className="action-btn" onClick={() => saveSong(song.playbackUrl, song.title || "我的demo")}>
                  下载
                </View>
              </View>

              {publicConfig.enableFullSong ? (
                <View className="actions" style={{ marginTop: Taro.pxTransform(20) }}>
                  <View className="primary" onClick={goFull}>
                    生成完整版歌曲
                  </View>
                  <View className="ghost" onClick={openLibrary}>
                    我的音频
                  </View>
                </View>
              ) : (
                <View className="ghost" style={{ marginTop: Taro.pxTransform(20) }} onClick={openLibrary}>
                  我的音频
                </View>
              )}

              <View className="ghost" onClick={resetToRecord}>
                ← 再哼一首
              </View>
            </View>
          ) : null}

          {state === "failed" ? (
            <View className="center-block">
              <Text className="head-title">出了点问题</Text>
              <Text className="error-text">{error || "生成失败，请重试"}</Text>
              <View className="actions" style={{ width: "100%" }}>
                <View className={`primary ${demoSubmitting ? "loading disabled" : ""}`} onClick={submitDemo}>
                  {demoSubmitting ? (
                    <View className="btn-loading">
                      <View className="btn-spinner" />
                      <Text>提交中…</Text>
                    </View>
                  ) : (
                    "重试"
                  )}
                </View>
                <View className="ghost" onClick={resetToRecord}>
                  ← 返回重新录制
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
