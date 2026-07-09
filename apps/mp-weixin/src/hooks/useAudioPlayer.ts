import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";

export interface AudioPlaybackMeta {
  title?: string;
  epname?: string;
  singer?: string;
  coverImgUrl?: string;
}

export interface AudioPlayer {
  playingUrl?: string;
  progress: number;
  toggle: (url?: string, meta?: AudioPlaybackMeta) => void;
  stop: () => void;
  isPlaying: (url?: string) => boolean;
}

interface UseAudioPlayerOptions {
  mode?: "inner" | "background";
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): AudioPlayer {
  const mode = options.mode ?? "inner";
  const audioRef = useRef<Taro.InnerAudioContext>();
  const backgroundRef = useRef<Taro.BackgroundAudioManager>();
  const currentUrlRef = useRef<string>();
  const backgroundSessionRef = useRef(0);
  const mountedRef = useRef(true);
  const [playingUrl, setPlayingUrl] = useState<string>();
  const [progress, setProgress] = useState(0);

  function setSafePlayingUrl(url?: string) {
    if (mountedRef.current) {
      setPlayingUrl(url);
    }
  }

  function setSafeProgress(value: number) {
    if (mountedRef.current) {
      setProgress(value);
    }
  }

  function stop() {
    if (mode === "background") {
      backgroundSessionRef.current += 1;
      const audio = backgroundRef.current ?? Taro.getBackgroundAudioManager();
      backgroundRef.current = audio;
      audio.stop();
    } else {
      audioRef.current?.stop();
      audioRef.current?.destroy();
      audioRef.current = undefined;
    }
    currentUrlRef.current = undefined;
    setSafePlayingUrl(undefined);
    setSafeProgress(0);
  }

  function toggle(url?: string, meta?: AudioPlaybackMeta) {
    if (!url) {
      return;
    }
    if (playingUrl === url) {
      stop();
      return;
    }
    stop();
    currentUrlRef.current = url;

    if (mode === "background") {
      const audio = Taro.getBackgroundAudioManager();
      const session = backgroundSessionRef.current + 1;
      backgroundSessionRef.current = session;
      backgroundRef.current = audio;
      audio.title = meta?.title || "Demo2Song";
      audio.epname = meta?.epname || meta?.title || "Demo2Song";
      audio.singer = meta?.singer || "Demo2Song";
      if (meta?.coverImgUrl) {
        audio.coverImgUrl = meta.coverImgUrl;
      }
      audio.onPlay(() => {
        if (backgroundSessionRef.current === session) {
          setSafePlayingUrl(url);
        }
      });
      audio.onTimeUpdate(() => {
        if (backgroundSessionRef.current !== session) {
          return;
        }
        const total = audio.duration || 1;
        setSafeProgress(Math.min(1, audio.currentTime / total));
      });
      audio.onEnded(() => {
        if (backgroundSessionRef.current === session) {
          setSafePlayingUrl(undefined);
          setSafeProgress(0);
        }
      });
      audio.onStop(() => {
        if (backgroundSessionRef.current === session) {
          setSafePlayingUrl(undefined);
          setSafeProgress(0);
        }
      });
      audio.onError(() => {
        if (backgroundSessionRef.current === session) {
          setSafePlayingUrl(undefined);
          setSafeProgress(0);
        }
      });
      audio.src = url;
      audio.play();
      return;
    }

    const audio = Taro.createInnerAudioContext();
    audioRef.current = audio;
    audio.src = url;
    audio.onPlay(() => setSafePlayingUrl(url));
    audio.onTimeUpdate(() => {
      const total = audio.duration || 1;
      setSafeProgress(Math.min(1, audio.currentTime / total));
    });
    audio.onEnded(() => {
      setSafePlayingUrl(undefined);
      setSafeProgress(0);
    });
    audio.onStop(() => setSafePlayingUrl(undefined));
    audio.onError(() => {
      setSafePlayingUrl(undefined);
      setSafeProgress(0);
    });
    audio.play();
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (mode === "inner") {
        audioRef.current?.stop();
        audioRef.current?.destroy();
        audioRef.current = undefined;
      }
    };
  }, [mode]);

  return {
    playingUrl,
    progress,
    toggle,
    stop,
    isPlaying: (url?: string) => Boolean(url) && playingUrl === url
  };
}
