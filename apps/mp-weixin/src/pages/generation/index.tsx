import { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidHide, useDidShow, useRouter } from "@tarojs/taro";
import type { JobDetail, PublicAppConfig } from "@demo2song/shared";
import { authHeader, ensureLogin, errorMessage, request } from "../../utils/request";
import {
  clearActiveGeneration,
  registerGenerationNotice,
  requestGenerationNotice,
  saveActiveGeneration
} from "../../utils/generation";
import "./index.scss";

export default function GenerationPage() {
  const router = useRouter();
  const jobId = router.params.jobId ?? "";
  const songId = router.params.songId ?? "";
  const [message, setMessage] = useState("任务已提交，可以放心离开小程序");
  const [failed, setFailed] = useState<string>();
  const [templateId, setTemplateId] = useState<string>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const visibleRef = useRef(false);

  function stopPolling() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
  }

  async function refresh() {
    if (!jobId) return;
    try {
      const uid = await ensureLogin();
      const job = await request<JobDetail>(`/jobs/${jobId}`, { header: authHeader(uid) });
      if (job.status === "succeeded" && job.songId) {
        stopPolling();
        clearActiveGeneration(jobId);
        Taro.redirectTo({ url: `/pages/song/index?id=${job.songId}` });
      } else if (job.status === "failed") {
        stopPolling();
        clearActiveGeneration(jobId);
        setFailed(job.errorMessage || "生成失败，请重试");
      } else {
        setMessage(job.status === "queued" ? "任务正在排队，可以放心离开小程序" : "AI 正在创作，可以放心离开小程序");
      }
    } catch (error) {
      const text = errorMessage(error, "暂时无法查询");
      if (/interrupt|abort|timeout|network/i.test(text)) {
        setMessage("网络暂时中断，回到前台后会自动查询");
      } else {
        setMessage("暂时无法查询，稍后会自动重试");
      }
    }
  }

  useDidShow(() => {
    visibleRef.current = true;
    if (jobId && songId) saveActiveGeneration({ jobId, songId });
    request<PublicAppConfig>("/config/public").then((value) => setTemplateId(value.generationNoticeTemplateId)).catch(() => undefined);
    void refresh();
    stopPolling();
    timerRef.current = setInterval(() => {
      if (visibleRef.current) void refresh();
    }, 2500);
  });

  useDidHide(() => {
    visibleRef.current = false;
    stopPolling();
  });

  async function subscribe() {
    const accepted = await requestGenerationNotice(templateId);
    if (!accepted) {
      Taro.showToast({ title: templateId ? "未开启通知" : "通知模板尚未配置", icon: "none" });
      return;
    }
    try {
      const uid = await ensureLogin();
      await registerGenerationNotice(jobId, uid);
      Taro.showToast({ title: "完成后会通知你", icon: "success" });
    } catch {
      Taro.showToast({ title: "通知登记失败，请重试", icon: "none" });
    }
  }

  return (
    <View className="page generation-page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />
      <View className="generation-card">
        {failed ? <Text className="generation-title">生成未完成</Text> : <View className="generation-spinner" />}
        <Text className="generation-title">{failed ? failed : "正在为你创作…"}</Text>
        {!failed ? <Text className="generation-desc">{message}</Text> : null}
        {!failed ? (
          <>
            <View className="generation-notice" onClick={subscribe}>完成后通知我</View>
            <Text className="generation-tip">开启通知后可关闭小程序，完成后会收到微信服务通知</Text>
          </>
        ) : null}
        <View className="generation-library" onClick={() => Taro.redirectTo({ url: "/pages/library/index" })}>查看我的音频</View>
      </View>
    </View>
  );
}
