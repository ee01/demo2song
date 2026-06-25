import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";

export interface AudioPlayer {
  playingUrl?: string;
  progress: number;
  toggle: (url?: string) => void;
  stop: () => void;
  isPlaying: (url?: string) => boolean;
}

export function useAudioPlayer(): AudioPlayer {
  const audioRef = useRef<Taro.InnerAudioContext>();
  const [playingUrl, setPlayingUrl] = useState<string>();
  const [progress, setProgress] = useState(0);

  function stop() {
    audioRef.current?.stop();
    audioRef.current?.destroy();
    audioRef.current = undefined;
    setPlayingUrl(undefined);
    setProgress(0);
  }

  function toggle(url?: string) {
    if (!url) {
      return;
    }
    if (playingUrl === url) {
      stop();
      return;
    }
    stop();
    const audio = Taro.createInnerAudioContext();
    audioRef.current = audio;
    audio.src = url;
    audio.onPlay(() => setPlayingUrl(url));
    audio.onTimeUpdate(() => {
      const total = audio.duration || 1;
      setProgress(Math.min(1, audio.currentTime / total));
    });
    audio.onEnded(() => {
      setPlayingUrl(undefined);
      setProgress(0);
    });
    audio.onStop(() => setPlayingUrl(undefined));
    audio.onError(() => {
      setPlayingUrl(undefined);
      setProgress(0);
    });
    audio.play();
  }

  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current?.destroy();
      audioRef.current = undefined;
    };
  }, []);

  return {
    playingUrl,
    progress,
    toggle,
    stop,
    isPlaying: (url?: string) => Boolean(url) && playingUrl === url
  };
}
