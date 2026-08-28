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
  loadingUrl?: string;
  progress: number;
  toggle: (url?: string, meta?: AudioPlaybackMeta) => void;
  stop: () => void;
  isPlaying: (url?: string) => boolean;
  isLoading: (url?: string) => boolean;
}

interface UseAudioPlayerOptions {
  mode?: "inner" | "background";
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): AudioPlayer {
  const mode = options.mode ?? "inner";
  const audioRef = useRef<Taro.InnerAudioContext>();
  const backgroundRef = useRef<Taro.BackgroundAudioManager>();
  const currentUrlRef = useRef<string>();
  const sessionRef = useRef(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const [playingUrl, setPlayingUrl] = useState<string>();
  const [loadingUrl, setLoadingUrl] = useState<string>();
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

  function setSafeLoadingUrl(url?: string) {
    if (mountedRef.current) {
      setLoadingUrl(url);
    }
  }

  function clearLoadingTimer() {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = undefined;
    }
  }

  function startLoadingTimer(url: string, session: number) {
    clearLoadingTimer();
    loadingTimerRef.current = setTimeout(() => {
      if (sessionRef.current === session && currentUrlRef.current === url) {
        setSafeLoadingUrl(url);
      }
    }, 1000);
  }

  function markStarted(url: string, session: number) {
    if (sessionRef.current !== session || currentUrlRef.current !== url) {
      return;
    }
    clearLoadingTimer();
    setSafeLoadingUrl(undefined);
    setSafePlayingUrl(url);
  }

  function finish(session: number) {
    if (sessionRef.current !== session) {
      return;
    }
    clearLoadingTimer();
    currentUrlRef.current = undefined;
    setSafePlayingUrl(undefined);
    setSafeLoadingUrl(undefined);
    setSafeProgress(0);
  }

  function stop() {
    sessionRef.current += 1;
    clearLoadingTimer();
    if (mode === "background") {
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
    setSafeLoadingUrl(undefined);
    setSafeProgress(0);
  }

  function toggle(url?: string, meta?: AudioPlaybackMeta) {
    if (!url) {
      return;
    }
    if (currentUrlRef.current === url) {
      stop();
      return;
    }
    stop();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    currentUrlRef.current = url;
    setSafePlayingUrl(url);
    setSafeLoadingUrl(undefined);
    startLoadingTimer(url, session);

    if (mode === "background") {
      const audio = Taro.getBackgroundAudioManager();
      backgroundRef.current = audio;
      audio.title = meta?.title || "随哼";
      audio.epname = meta?.epname || meta?.title || "随哼";
      audio.singer = meta?.singer || "随哼";
      if (meta?.coverImgUrl) {
        audio.coverImgUrl = meta.coverImgUrl;
      }
      audio.onPlay(() => {
        markStarted(url, session);
      });
      audio.onTimeUpdate(() => {
        if (sessionRef.current !== session) {
          return;
        }
        markStarted(url, session);
        const total = audio.duration || 1;
        setSafeProgress(Math.min(1, audio.currentTime / total));
      });
      audio.onEnded(() => finish(session));
      audio.onStop(() => finish(session));
      audio.onError(() => finish(session));
      audio.src = url;
      audio.play();
      return;
    }

    const audio = Taro.createInnerAudioContext();
    audioRef.current = audio;
    audio.src = url;
    audio.onPlay(() => markStarted(url, session));
    audio.onTimeUpdate(() => {
      if (sessionRef.current !== session) {
        return;
      }
      markStarted(url, session);
      const total = audio.duration || 1;
      setSafeProgress(Math.min(1, audio.currentTime / total));
    });
    audio.onEnded(() => finish(session));
    audio.onStop(() => finish(session));
    audio.onError(() => finish(session));
    audio.play();
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      clearLoadingTimer();
      if (mode === "inner") {
        audioRef.current?.stop();
        audioRef.current?.destroy();
        audioRef.current = undefined;
      }
    };
  }, [mode]);

  return {
    playingUrl,
    loadingUrl,
    progress,
    toggle,
    stop,
    isPlaying: (url?: string) => Boolean(url) && playingUrl === url,
    isLoading: (url?: string) => Boolean(url) && loadingUrl === url
  };
}
