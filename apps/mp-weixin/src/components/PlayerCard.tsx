import { useMemo } from "react";
import type { ReactNode } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { AudioPlayer } from "../hooks/useAudioPlayer";

interface PlayerCardProps {
  player: AudioPlayer;
  url?: string;
  title: string;
  subtitle?: string;
  big?: boolean;
  barsKey?: string;
  onBeforeToggle?: () => void;
  children?: ReactNode;
}

export default function PlayerCard({
  player,
  url,
  title,
  subtitle,
  big,
  barsKey,
  onBeforeToggle,
  children
}: PlayerCardProps) {
  const bars = useMemo(
    () => Array.from({ length: 40 }, () => 12 + Math.round(Math.random() * 40)),
    [barsKey ?? url]
  );
  const playing = player.isPlaying(url);

  return (
    <View className="player-card">
      <View
        className={`play-fab ${big ? "lg" : ""}`}
        onClick={() => {
          onBeforeToggle?.();
          player.toggle(url, { title });
        }}
      >
        {playing ? (
          <View className="pause-icon">
            <View className="bar" />
            <View className="bar" />
          </View>
        ) : (
          <View className="play-triangle" />
        )}
      </View>
      <View className="pc-mid">
        <View className={`wave ${playing ? "playing" : ""}`}>
          {bars.map((height, index) => (
            <View
              key={index}
              className={`wave-bar ${index / bars.length <= player.progress ? "played" : ""}`}
              style={{ height: Taro.pxTransform(height) }}
            />
          ))}
        </View>
        <Text className="pc-meta">
          {playing ? "正在播放…" : title}
          {subtitle ? ` · ${subtitle}` : ""}
        </Text>
      </View>
      {children}
    </View>
  );
}
