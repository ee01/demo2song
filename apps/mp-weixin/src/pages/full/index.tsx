import { useEffect, useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type {
  CreateFullJobResponse,
  GenerateFullDraftResponse,
  JobDetail,
  PublicAppConfig,
  SongDetail
} from "@demo2song/shared";
import SongInfoForm from "../../components/SongInfoForm";
import PlayerCard from "../../components/PlayerCard";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { emptyPromptForm, inputToPromptForm, promptFormToInput, type PromptForm } from "../../constants";
import { authHeader, ensureLogin, request, errorMessage } from "../../utils/request";
import { registerGenerationNotice, requestGenerationNotice, saveActiveGeneration } from "../../utils/generation";
import "./index.scss";

type Phase = "config" | "generating" | "failed";
type DraftPhase = "idle" | "generating" | "ready" | "failed";

export default function FullPage() {
  const router = useRouter();
  const demoId = router.params.demoId ?? "";

  const [userId, setUserId] = useState<string>();
  const [demo, setDemo] = useState<SongDetail>();
  const [form, setForm] = useState<PromptForm>(emptyPromptForm());
  const [phase, setPhase] = useState<Phase>("config");
  const [jobId, setJobId] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [draftPhase, setDraftPhase] = useState<DraftPhase>("idle");
  const [noticeTemplateId, setNoticeTemplateId] = useState<string>();

  const titleEditedRef = useRef(false);
  const lyricsEditedRef = useRef(false);

  const player = useAudioPlayer();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        request<PublicAppConfig>("/config/public").then((value) => setNoticeTemplateId(value.generationNoticeTemplateId)).catch(() => undefined);
        const uid = await ensureLogin();
        if (!active) return;
        setUserId(uid);
        const detail = await request<SongDetail>(`/songs/${demoId}`, { header: authHeader(uid) });
        if (!active) return;
        const initialForm = inputToPromptForm(detail.prompt);
        setDemo(detail);
        setForm((current) => ({
          ...initialForm,
          title: titleEditedRef.current ? current.title : initialForm.title,
          lyrics: lyricsEditedRef.current ? current.lyrics : initialForm.lyrics
        }));

        setDraftPhase("generating");
        try {
          const draft = await request<GenerateFullDraftResponse>(`/songs/${demoId}/full-draft`, {
            method: "POST",
            header: authHeader(uid),
            data: { prompt: promptFormToInput(initialForm) }
          });
          if (!active) return;
          setForm((current) => ({
            ...current,
            title: titleEditedRef.current ? current.title : draft.title,
            lyrics: lyricsEditedRef.current ? current.lyrics : draft.lyrics
          }));
          setDraftPhase("ready");
        } catch {
          if (active) setDraftPhase("failed");
        }
      } catch (loadError) {
        if (active) setError(errorMessage(loadError, "加载失败"));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoId]);

  useEffect(() => {
    if (!jobId || !userId || phase !== "generating") {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const job = await request<JobDetail>(`/jobs/${jobId}`, { header: authHeader(userId) });
        if (job.status === "failed") {
          setPhase("failed");
          setError(job.errorMessage || "生成失败");
        }
        if (job.status === "succeeded" && job.songId) {
          player.stop();
          Taro.redirectTo({ url: `/pages/song/index?id=${job.songId}` });
        }
      } catch (pollError) {
        setPhase("failed");
        setError(errorMessage(pollError, "查询任务失败"));
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [jobId, phase, userId, player]);

  async function generateFull() {
    if (!demoId || submitting || phase === "generating") return;
    setError(undefined);
    const noticePromise = requestGenerationNotice(noticeTemplateId);
    setSubmitting(true);
    try {
      const uid = userId ?? (await ensureLogin());
      setUserId(uid);
      const job = await request<CreateFullJobResponse>(`/songs/${demoId}/full-jobs`, {
        method: "POST",
        header: authHeader(uid),
        data: {
          prompt: promptFormToInput(form),
          title: form.title.trim() || undefined,
          lyrics: form.lyrics.trim() || undefined
        }
      });
      saveActiveGeneration({ jobId: job.jobId, songId: job.songId });
      if (await noticePromise) {
        await registerGenerationNotice(job.jobId, uid).catch(() => undefined);
      }
      Taro.redirectTo({ url: `/pages/generation/index?jobId=${job.jobId}&songId=${job.songId}` });
    } catch (submitError) {
      setPhase("failed");
      setError(errorMessage(submitError, "提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "generating") {
    return (
      <View className="page">
        <View className="glow glow-1" />
        <View className="glow glow-2" />
        <View className="screen center-screen">
          <View className="spinner" />
          <Text className="head-title">正在生成完整版…</Text>
          <Text className="head-desc">完整歌曲耗时更久，大约 1-2 分钟，请耐心等待</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />
      <View className="screen full-screen">
        <View className="head">
          <Text className="head-title">生成完整版歌曲</Text>
          <Text className="head-desc">
            可以在这里<Text className="head-strong">微调补充信息</Text>，我们会基于你的 demo 创作一首更完整的歌
          </Text>
        </View>

        {demo ? (
          <View style={{ marginBottom: Taro.pxTransform(44) }}>
            <PlayerCard
              player={player}
              url={demo.playbackUrl}
              title={demo.title || "原 demo"}
              subtitle={demo.durationSeconds ? `约 ${demo.durationSeconds} 秒` : undefined}
            />
          </View>
        ) : null}

        <SongInfoForm
          value={form}
          onChange={setForm}
          showGeneratedContent
          generatingContent={draftPhase === "generating"}
          onGeneratedContentEdit={(field) => {
            if (field === "title") titleEditedRef.current = true;
            if (field === "lyrics") lyricsEditedRef.current = true;
          }}
        />

        {draftPhase === "failed" ? (
          <Text className="draft-hint">AI 歌名和歌词生成失败，你仍然可以手动填写并直接生成。</Text>
        ) : null}

        {error ? <Text className="error-text">{error}</Text> : null}
      </View>

      <View className="generation-action-bar">
        <View
          className="generation-action-secondary"
          onClick={() => {
            player.stop();
            Taro.navigateBack();
          }}
        >
          返回
        </View>
        <View className={`primary ${submitting ? "loading disabled" : ""}`} onClick={generateFull}>
          {submitting ? (
            <View className="btn-loading">
              <View className="btn-spinner" />
              <Text>提交中…</Text>
            </View>
          ) : (
            "生成完整版"
          )}
        </View>
      </View>
    </View>
  );
}
