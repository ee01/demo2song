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
    Taro.navigateTo({ url: `/pages/song/index?id=${song.id}` });
  }

  const isEmpty = !loading && data.demos.length === 0 && data.fullSongs.length === 0;

  function renderItem(song: SongBrief, icon: string) {
    return (
      <View key={song.id} className="song-item" onClick={() => openSong(song)}>
        <View className="si-icon">{icon}</View>
        <View className="si-main">
          <Text className="si-title">{song.title || (song.stage === "demo" ? "我的 demo" : "完整版歌曲")}</Text>
          <Text className="si-meta">{statusLabel(song)}</Text>
        </View>
        <Text className="si-arrow">›</Text>
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
