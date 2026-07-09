import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter, useShareAppMessage } from "@tarojs/taro";
import type { SongDetail } from "@demo2song/shared";
import PlayerCard from "../../components/PlayerCard";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { authHeader, ensureLogin, request } from "../../utils/request";
import { saveSong } from "../../utils/download";
import "./index.scss";

export default function SongPage() {
  const router = useRouter();
  const id = router.params.id ?? "";

  const [song, setSong] = useState<SongDetail>();
  const [error, setError] = useState<string>();
  const inlinePlayer = useAudioPlayer();
  const backgroundPlayer = useAudioPlayer({ mode: "background" });

  useShareAppMessage(() => ({
    title: song?.title ? `听听这首《${song.title}》` : "我用哼唱生成了一首歌，你也来试试",
    path: `/pages/play/index?songId=${id}`
  }));

  useDidShow(() => {
    (async () => {
      try {
        const uid = await ensureLogin();
        const detail = await request<SongDetail>(`/songs/${id}`, { header: authHeader(uid) });
        if (detail.stage === "full" && detail.parentDemoId && !detail.recordingPlaybackUrl) {
          const parentDemo = await request<SongDetail>(`/songs/${detail.parentDemoId}`, { header: authHeader(uid) });
          setSong({
            ...detail,
            parentDemoPlaybackUrl: detail.parentDemoPlaybackUrl ?? parentDemo.playbackUrl,
            recordingPlaybackUrl: parentDemo.recordingPlaybackUrl,
            recordingDurationSeconds: parentDemo.recordingDurationSeconds
          });
          return;
        }
        setSong(detail);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      }
    })();
  });

  const isDemo = song?.stage === "demo";
  const primaryPlayer = isDemo ? inlinePlayer : backgroundPlayer;

  function stopAllPlayers() {
    inlinePlayer.stop();
    backgroundPlayer.stop();
  }

  function renderReferenceAudio(title: string, url?: string, subtitle?: string) {
    if (!url) {
      return null;
    }
    const playing = inlinePlayer.isPlaying(url);
    return (
      <View
        className="reference-audio"
        onClick={() => {
          backgroundPlayer.stop();
          inlinePlayer.toggle(url, { title });
        }}
      >
        <View className="play-fab mini-fab">
          {playing ? (
            <View className="pause-icon">
              <View className="bar" />
              <View className="bar" />
            </View>
          ) : (
            <View className="play-triangle" />
          )}
        </View>
        <View className="reference-mid">
          <Text className="reference-title">{playing ? "正在播放…" : title}</Text>
          {subtitle ? <Text className="reference-subtitle">{subtitle}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />
      <View className="screen song-screen">
        {!song ? (
          <Text className="empty">{error || "加载中…"}</Text>
        ) : (
          <View>
            <View className="head">
              <Text className="head-title">{song.title || (isDemo ? "我的 demo" : "完整版歌曲")}</Text>
              <Text className="head-desc">
                <Text className="tag-pill">{isDemo ? "demo" : "完整版"}</Text>
                {song.durationSeconds ? `约 ${song.durationSeconds} 秒` : ""}
              </Text>
            </View>

            <PlayerCard
              player={primaryPlayer}
              url={song.playbackUrl}
              title={song.title || (isDemo ? "我的 demo" : "完整版")}
              subtitle={song.durationSeconds ? `约 ${song.durationSeconds} 秒` : undefined}
              onBeforeToggle={() => {
                if (!isDemo) {
                  inlinePlayer.stop();
                }
              }}
            />

            <View className="actions-row" style={{ marginTop: Taro.pxTransform(28) }}>
              <Button className="action-btn" openType="share">
                分享给好友
              </Button>
              <View className="action-btn" onClick={() => saveSong(song.playbackUrl, song.title || "我的歌曲")}>
                下载保存
              </View>
            </View>

            {isDemo && song.recordingPlaybackUrl ? (
              <View
                className="player-card mini"
                style={{ marginTop: Taro.pxTransform(24) }}
                onClick={() => inlinePlayer.toggle(song.recordingPlaybackUrl, { title: "录制原声" })}
              >
                <View className="play-fab">
                  {inlinePlayer.isPlaying(song.recordingPlaybackUrl) ? (
                    <View className="pause-icon">
                      <View className="bar" />
                      <View className="bar" />
                    </View>
                  ) : (
                    <View className="play-triangle" />
                  )}
                </View>
                <View className="pc-mid">
                  <Text className="pc-meta">
                    {inlinePlayer.isPlaying(song.recordingPlaybackUrl) ? "正在播放…" : "试听原录音（哼唱）"}
                  </Text>
                </View>
              </View>
            ) : null}

            {!isDemo && (song.parentDemoPlaybackUrl || song.recordingPlaybackUrl) ? (
              <View className="reference-audio-list">
                {renderReferenceAudio(
                  "demo 音频",
                  song.parentDemoPlaybackUrl,
                  song.parentDemoId ? "生成完整版时使用的 demo" : undefined
                )}
                {renderReferenceAudio(
                  "录制原声",
                  song.recordingPlaybackUrl,
                  song.recordingDurationSeconds ? `原始哼唱 · 约 ${song.recordingDurationSeconds} 秒` : "原始哼唱"
                )}
              </View>
            ) : null}

            {song.lyrics ? (
              <View className="lyrics-card">
                <Text className="lyrics-title">歌词</Text>
                <Text className="lyrics-text">{song.lyrics}</Text>
              </View>
            ) : null}

            <View className="actions" style={{ marginTop: Taro.pxTransform(36) }}>
              {isDemo ? (
                <View
                  className="ghost"
                  onClick={() => {
                    stopAllPlayers();
                    Taro.navigateTo({ url: `/pages/full/index?demoId=${song.id}` });
                  }}
                >
                  {song.hasFull ? "重新生成新的完整歌曲" : "生成完整版歌曲"}
                </View>
              ) : null}

              {!isDemo && song.parentDemoId ? (
                <View
                  className="ghost"
                  onClick={() => {
                    stopAllPlayers();
                    Taro.navigateTo({ url: `/pages/song/index?id=${song.parentDemoId}` });
                  }}
                >
                  查看原 demo
                </View>
              ) : null}

              <View
                className="ghost"
                onClick={() => {
                  stopAllPlayers();
                  Taro.reLaunch({ url: "/pages/index/index" });
                }}
              >
                ← 再哼一首
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
