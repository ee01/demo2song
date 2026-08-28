import { useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import type { PublicSong } from "@demo2song/shared";
import PlayerCard from "../../components/PlayerCard";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { request } from "../../utils/request";
import "./index.scss";

export default function PlayPage() {
  const router = useRouter();
  const songId = router.params.songId ?? "";

  const [song, setSong] = useState<PublicSong>();
  const [error, setError] = useState<string>();
  const player = useAudioPlayer();

  useShareAppMessage(() => ({
    title: song?.title ? `我在随哼创作了《${song.title}》，听听看` : "随哼：哼一段旋律，生成一首歌",
    path: `/pages/play/index?songId=${songId}`
  }));

  useEffect(() => {
    request<PublicSong>(`/public/songs/${songId}`)
      .then(setSong)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "加载失败"));
  }, [songId]);

  function createMine() {
    player.stop();
    Taro.reLaunch({ url: "/pages/index/index" });
  }

  return (
    <View className="page">
      <View className="glow glow-1" />
      <View className="glow glow-2" />
      <View className="screen play-screen">
        <View className="brand">
          <Text className="brand-title">哼一段，变成歌</Text>
          <Text className="brand-sub">朋友用哼唱创作了一首歌，分享给你听 🎶</Text>
        </View>

        {!song ? (
          <Text className="empty">{error || "加载中…"}</Text>
        ) : (
          <View className="play-body">
            <Text className="play-title">{song.title || "一首歌"}</Text>
            <PlayerCard
              player={player}
              url={song.playbackUrl}
              title={song.title || "一首歌"}
              subtitle={song.durationSeconds ? `约 ${song.durationSeconds} 秒` : undefined}
              big
            />

            {song.lyrics ? (
              <View className="lyrics-card">
                <Text className="lyrics-title">歌词</Text>
                <Text className="lyrics-text">{song.lyrics}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View className="play-cta">
          <View className="primary" onClick={createMine}>
            生成你自己的歌
          </View>
          <Text className="sub-hint" style={{ textAlign: "center" }}>
            只需哼唱几秒，AI 帮你写成完整歌曲
          </Text>
        </View>
      </View>
    </View>
  );
}
