import { useEffect, useRef, useState } from "react";
import { Button, PageMeta, Text, View } from "@tarojs/components";
import Taro, { useDidHide, useShareAppMessage } from "@tarojs/taro";
import type { JobDetail, PublicAppConfig, SongBrief } from "@demo2song/shared";
import SongInfoForm from "../../components/SongInfoForm";
import PlayerCard, { PlayerButtonIcon } from "../../components/PlayerCard";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { emptyPromptForm, promptFormToInput, type PromptForm } from "../../constants";
import { API_BASE, authHeader, ensureLogin, request, errorMessage } from "../../utils/request";
import { saveSong } from "../../utils/download";
import { hasVoiceprintAgreement, saveVoiceprintAgreement } from "../../utils/voiceprintAgreement";
import { registerGenerationNotice, requestGenerationNotice, saveActiveGeneration } from "../../utils/generation";
import "./index.scss";

const recorder = Taro.getRecorderManager();

type GenerationState = "idle" | "recorded" | "uploading" | "queued" | "generating" | "ready" | "failed";
type Screen = "record" | "details" | "result";
type RecorderPhase = "idle" | "starting" | "recording" | "stopping";

const noteGlyphs = ["♪", "♫", "♬", "♩"];
const noteVariants = ["note-a", "note-b", "note-c"];
// CloudBase's HTTP gateway rejects uploads near 1 MiB. At the 60-second
// recording limit, 64 kbps mono MP3 stays comfortably below that threshold.
const RECORDING_SAMPLE_RATE = 16000;
const RECORDING_BIT_RATE = 64000;

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
  const [voiceprintAgreed, setVoiceprintAgreed] = useState(hasVoiceprintAgreement);
  const [showVoiceprintNotice, setShowVoiceprintNotice] = useState(() => !hasVoiceprintAgreement());

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>({
    minRecordingSeconds: 6,
    maxRecordingSeconds: 60,
    demoTargetSeconds: 30,
    enableFullSong: true
  });

  const recordingStartedAt = useRef(0);
  const recorderPhaseRef = useRef<RecorderPhase>("idle");
  const releaseRequestedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const consentTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const noteRef = useRef<ReturnType<typeof setInterval>>();
  const noteId = useRef(0);
  const configRef = useRef(publicConfig);
  configRef.current = publicConfig;

  const player = useAudioPlayer();

  const [navBottom] = useState(getNavBottom);

  useShareAppMessage(() => ({
    title: song?.title ? `我在随哼创作了《${song.title}》，听听看` : "随哼：哼一段旋律，生成一首歌",
    path: song ? `/pages/play/index?songId=${song.id}` : "/pages/index/index"
  }));

  useEffect(() => {
    if (voiceprintAgreed || !showVoiceprintNotice) {
      return;
    }
    consentTimerRef.current = setTimeout(() => {
      setShowVoiceprintNotice(false);
    }, 15000);

    return () => {
      if (consentTimerRef.current) clearTimeout(consentTimerRef.current);
    };
  }, [showVoiceprintNotice, voiceprintAgreed]);

  useDidHide(() => {
    if (consentTimerRef.current) clearTimeout(consentTimerRef.current);
    setShowVoiceprintNotice(false);
  });

  useEffect(() => {
    request<PublicAppConfig>("/config/public")
      .then(setPublicConfig)
      .catch(() => undefined);

    ensureLogin()
      .then(setUserId)
      .catch((loginError) => setError(errorMessage(loginError, "微信登录失败")));

    recorder.onStart(() => {
      recordingStartedAt.current = Date.now();
      if (releaseRequestedRef.current) {
        recorderPhaseRef.current = "stopping";
        recorder.stop();
        return;
      }
      recorderPhaseRef.current = "recording";
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - recordingStartedAt.current) / 1000);
      }, 100);
      noteRef.current = setInterval(spawnNote, 280);
    });

    recorder.onStop((result) => {
      clearTimers();
      recorderPhaseRef.current = "idle";
      releaseRequestedRef.current = false;
      setRecording(false);
      setNotes([]);
      const durationMs = result.duration || Date.now() - recordingStartedAt.current;
      const duration = Math.max(0, Math.round(durationMs / 1000));
      if (durationMs < configRef.current.minRecordingSeconds * 1000) {
        setState("idle");
        setElapsed(0);
        setRecordingPath(undefined);
        setRecordingDuration(0);
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
      recorderPhaseRef.current = "idle";
      releaseRequestedRef.current = false;
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (noteRef.current) {
      clearInterval(noteRef.current);
      noteRef.current = undefined;
    }
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

  function openVoiceprintAgreement() {
    Taro.navigateTo({ url: "/pages/voiceprint-agreement/index" });
  }

  function acceptVoiceprintAgreement() {
    try {
      saveVoiceprintAgreement();
    } catch {
      Taro.showToast({ title: "授权保存失败，请重试", icon: "none" });
      return;
    }
    if (consentTimerRef.current) clearTimeout(consentTimerRef.current);
    setVoiceprintAgreed(true);
    setShowVoiceprintNotice(false);
    Taro.showToast({ title: "已同意", icon: "success" });
  }

  function startRecord() {
    if (recorderPhaseRef.current !== "idle") return;
    if (!voiceprintAgreed) {
      setShowVoiceprintNotice(true);
      Taro.showToast({ title: "请先同意声纹授权协议", icon: "none" });
      return;
    }
    setError(undefined);
    setSong(undefined);
    recorderPhaseRef.current = "starting";
    releaseRequestedRef.current = false;
    setElapsed(0);
    setRecording(true);
    setState("idle");
    recorder.start({
      duration: configRef.current.maxRecordingSeconds * 1000,
      sampleRate: RECORDING_SAMPLE_RATE,
      numberOfChannels: 1,
      encodeBitRate: RECORDING_BIT_RATE,
      format: "mp3"
    });
  }

  function stopRecord() {
    const phase = recorderPhaseRef.current;
    if (phase === "idle" || phase === "stopping") return;
    releaseRequestedRef.current = true;
    clearTimers();
    setRecording(false);
    setNotes([]);
    if (phase === "recording") {
      recorderPhaseRef.current = "stopping";
      recorder.stop();
    }
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

  async function uploadRecording(uid: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        setUploadProgress(0);
        const uploadTask = Taro.uploadFile({
          url: `${API_BASE}/recordings`,
          filePath: recordingPath!,
          name: "file",
          formData: { durationSeconds: String(recordingDuration) },
          header: authHeader(uid),
          timeout: 180000
        });
        uploadTask.onProgressUpdate((progress) => {
          setUploadProgress(Math.min(99, progress.progress));
        });
        return await uploadTask;
      } catch (uploadError) {
        const message = errorMessage(uploadError, "上传失败");
        const canRetry = attempt === 0 && /timeout/i.test(message);
        if (!canRetry) {
          throw new Error(/timeout/i.test(message) ? "录音上传超时，请检查网络后重试" : message);
        }
        Taro.showToast({ title: "网络较慢，正在重试上传", icon: "none" });
      }
    }
    throw new Error("录音上传失败，请重试");
  }

  async function submitDemo() {
    if (!recordingPath || demoSubmitting || generating) return;
    player.stop();
    const noticePromise = requestGenerationNotice(publicConfig.generationNoticeTemplateId);
    setDemoSubmitting(true);
    setState("uploading");
    setError(undefined);
    try {
      const uid = userId ?? (await ensureLogin());
      setUserId(uid);
      const uploadResult = await uploadRecording(uid);
      if (uploadResult.statusCode >= 400) {
        if (uploadResult.statusCode === 413) {
          throw new Error("录音文件过大，请重新录制后再试");
        }
        throw new Error(uploadResult.data);
      }
      setUploadProgress(100);
      const recordingRes = JSON.parse(uploadResult.data) as { id: string };
      setState("queued");

      const job = await request<{ jobId: string; songId: string }>("/songs/demo-jobs", {
        method: "POST",
        header: authHeader(uid),
        data: { recordingId: recordingRes.id, prompt: promptFormToInput(form) }
      });

      saveActiveGeneration(job);
      if (await noticePromise) {
        await registerGenerationNotice(job.jobId, uid).catch(() => undefined);
      }
      Taro.redirectTo({ url: `/pages/generation/index?jobId=${job.jobId}&songId=${job.songId}` });
    } catch (submitError) {
      setState("failed");
      setError(errorMessage(submitError, "提交失败"));
    } finally {
      setDemoSubmitting(false);
      setUploadProgress(0);
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
      <PageMeta pageStyle={screen === "record" ? "height: 100vh; overflow: hidden;" : ""} />
      <View className="glow glow-1" />
      <View className="glow glow-2" />

      {screen === "record" ? (
        <View className="screen record-screen" style={{ paddingTop: `${navBottom + 16}px` }}>
          <View
            className="record-touch-layer"
            catchMove
            onTouchStart={startRecord}
            onTouchEnd={stopRecord}
            onTouchCancel={stopRecord}
          />
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
              <View className={`mic-btn ${recording ? "pressing" : ""}`}>
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

      {screen === "record" && showVoiceprintNotice && !voiceprintAgreed ? (
        <View className="voiceprint-consent">
          <View className="voiceprint-copy">
            <Text>使用录音生成歌曲前，请阅读并同意</Text>
            <Text className="voiceprint-link" onClick={openVoiceprintAgreement}>
              《声纹授权协议》
            </Text>
          </View>
          <View className="voiceprint-agree" onClick={acceptVoiceprintAgreement}>
            同意
          </View>
        </View>
      ) : null}

      {screen === "details" ? (
        <>
          <View className="screen details-screen" style={{ paddingTop: `${navBottom + 24}px` }}>
            <View className="head">
              <Text className="head-title">完善歌曲信息</Text>
              <Text className="head-desc">
                下面的内容<Text className="head-strong">全部可选</Text>。什么都不填也行，我们会根据你的哼唱自动创作 🎶
              </Text>
            </View>

            <View style={{ marginBottom: Taro.pxTransform(44) }}>
              <PlayerCard player={player} url={recordingPath} title="我的哼唱" subtitle={`${recordingDuration} 秒`} />
            </View>

            <SongInfoForm value={form} onChange={setForm} />

            {error ? <Text className="error-text">{error}</Text> : null}
          </View>

          <View className="generation-action-bar">
            <View className="generation-action-secondary" onClick={resetToRecord}>
              重新录制
            </View>
            <View className={`primary ${demoSubmitting ? "loading disabled" : ""}`} onClick={submitDemo}>
              {demoSubmitting ? (
                <View className="btn-loading">
                  <View className="btn-spinner" />
                  <Text>
                    {state === "uploading" ? `上传中${uploadProgress ? ` ${uploadProgress}%` : "…"}` : "提交中…"}
                  </Text>
                </View>
              ) : (
                "生成 demo"
              )}
            </View>
          </View>
        </>
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
                  <PlayerButtonIcon player={player} url={recordingPath} />
                </View>
                <View className="pc-mid">
                  <Text className="pc-meta">
                    {player.isLoading(recordingPath)
                      ? "正在加载…"
                      : player.isPlaying(recordingPath)
                        ? "正在播放…"
                        : "试听原录音（哼唱）"}
                  </Text>
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
