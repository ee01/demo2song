import { useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import type { MySongsResponse, SongBrief } from "@demo2song/shared";
import { authHeader, ensureLogin, request } from "../../utils/request";
import "./index.scss";

function statusLabel(song: SongBrief): string {
  if (song.status === "ready") {
    return song.durationSeconds ? `约 ${song.durationSeconds} 秒` : "已完成";
  }
  if (song.status === "failed") {
    return "生成失败";
  }
  return "生成中…";
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function LibraryPage() {
  const [data, setData] = useState<MySongsResponse>({ demos: [], fullSongs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useDidShow(() => {
    (async () => {
      try {
        const uid = await ensureLogin();
        const res = await request<MySongsResponse>("/songs", { header: authHeader(uid) });
        setData(res);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  });

  function openSong(song: SongBrief) {
    if (song.status === "generating") {
      return;
    }
    if (song.status === "failed") {
      Taro.showModal({
        title: "生成失败原因",
        content: song.errorMessage || (song.errorCode ? `错误代码：${song.errorCode}` : "生成服务暂时未能完成这首歌曲，请稍后重新尝试。"),
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }
    Taro.navigateTo({ url: `/pages/song/index?id=${song.id}` });
  }

  const isEmpty = !loading && data.demos.length === 0 && data.fullSongs.length === 0;

  function renderItem(song: SongBrief, icon: string) {
    const interactive = song.status !== "generating";
    return (
      <View
        key={song.id}
        className={`song-item ${interactive ? "interactive" : "disabled"} ${song.status}`}
        onClick={interactive ? () => openSong(song) : undefined}
      >
        <View className="si-icon">{icon}</View>
        <View className="si-main">
          <Text className="si-title">{song.title || (song.stage === "demo" ? "我的 demo" : "完整版歌曲")}</Text>
          <View className="si-details">
            <Text className="si-meta">{statusLabel(song)}</Text>
            <Text className="si-time">{formatCreatedAt(song.createdAt)}</Text>
          </View>
        </View>
        {interactive ? <Text className="si-arrow">{song.status === "failed" ? "原因" : "›"}</Text> : null}
      </View>
    );
  }

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />
      <View className="screen library-screen">
        <View className="head">
          <Text className="head-title">我的音频</Text>
          <Text className="head-desc">这里收藏了你创作的 demo 与完整歌曲</Text>
        </View>

        {isEmpty ? (
          <View className="empty">
            <Text>还没有作品，去哼一段试试吧 🎤</Text>
            <View className="primary" style={{ marginTop: Taro.pxTransform(40) }} onClick={() => Taro.reLaunch({ url: "/pages/index/index" })}>
              去创作
            </View>
          </View>
        ) : null}

        {error && isEmpty ? <Text className="empty">{error}</Text> : null}

        {data.fullSongs.length > 0 ? (
          <View>
            <Text className="list-section-title">完整版歌曲</Text>
            <View className="list">{data.fullSongs.map((song) => renderItem(song, "🎵"))}</View>
          </View>
        ) : null}

        {data.demos.length > 0 ? (
          <View style={{ marginTop: Taro.pxTransform(36) }}>
            <Text className="list-section-title">demo</Text>
            <View className="list">{data.demos.map((song) => renderItem(song, "🎙"))}</View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
