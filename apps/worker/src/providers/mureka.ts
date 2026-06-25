import type {
  CreateDemoSongInput,
  ExtendSongInput,
  MusicProvider,
  NormalizedProviderError,
  ProviderCapabilities,
  ProviderSongResult
} from "@demo2song/shared";
import { env } from "../env.js";

export class MurekaProvider implements MusicProvider {
  getCapabilities(): ProviderCapabilities {
    return {
      name: "mureka",
      supportsHummingMelody: true,
      supportsSongExtend: true,
      extendIsApproximate: false,
      supportsCommercialUse: "unknown",
      minReferenceAudioSeconds: 5,
      maxReferenceAudioSeconds: 60
    };
  }

  async createDemoSong(input: CreateDemoSongInput): Promise<ProviderSongResult> {
    const melodyFileId = await this.uploadByUrl(input.recording.signedUrl, "melody");
    return this.createTask("/v1/song/generate", {
      lyrics: input.expandedLyrics,
      prompt: input.prompt.style,
      melody_file_id: melodyFileId
    });
  }

  async extendSong(input: ExtendSongInput): Promise<ProviderSongResult> {
    const audioFileId = await this.uploadByUrl(input.demoSong.signedUrl, "audio");
    return this.createTask("/v1/song/extend", {
      lyrics: input.expandedLyrics,
      audio_file_id: audioFileId,
      duration: input.targetDurationSeconds
    });
  }

  normalizeError(error: unknown): NormalizedProviderError {
    return {
      code: "MUREKA_ERROR",
      message: error instanceof Error ? error.message : "Mureka provider error",
      retryable: true,
      raw: error
    };
  }

  private async uploadByUrl(url: string, purpose: "melody" | "audio"): Promise<string> {
    if (!env.MUREKA_API_KEY) {
      throw new Error("MUREKA_API_KEY is required");
    }

    const response = await fetch("https://api.mureka.ai/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MUREKA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, purpose })
    });
    const data = (await response.json()) as { id?: string; file_id?: string; error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Mureka upload failed: ${response.status}`);
    }
    const fileId = data.id || data.file_id;
    if (!fileId) {
      throw new Error("Mureka upload did not return file id");
    }
    return fileId;
  }

  private async createTask(path: string, payload: Record<string, unknown>): Promise<ProviderSongResult> {
    if (!env.MUREKA_API_KEY) {
      throw new Error("MUREKA_API_KEY is required");
    }

    const response = await fetch(`https://api.mureka.ai${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MUREKA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Mureka task failed: ${response.status}`);
    }

    const taskId = String(data.task_id ?? data.id ?? "");
    if (!taskId) {
      throw new Error("Mureka task did not return task id");
    }

    const completed = await this.pollTask(taskId);
    return {
      provider: "mureka",
      providerTaskId: taskId,
      audioUrl: completed.audioUrl,
      mimeType: "audio/mpeg",
      lyrics: typeof payload.lyrics === "string" ? payload.lyrics : undefined,
      raw: { create: data, completed: completed.raw }
    };
  }

  private async pollTask(taskId: string): Promise<{ audioUrl?: string; raw: unknown }> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const response = await fetch(`https://api.mureka.ai/v1/song/query/${taskId}`, {
        headers: { Authorization: `Bearer ${env.MUREKA_API_KEY}` }
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(`Mureka query failed: ${response.status}`);
      }

      const status = String(data.status ?? data.state ?? data.task_status ?? "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(`Mureka task failed: ${status}`);
      }

      const audioUrl = findAudioUrl(data);
      if (audioUrl && ["", "success", "succeeded", "completed", "finished", "done"].includes(status)) {
        return { audioUrl, raw: data };
      }
      if (audioUrl && !status) {
        return { audioUrl, raw: data };
      }
    }

    throw new Error("Mureka task polling timed out");
  }
}

function findAudioUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === "string" && /(^|_)(audio|song|mp3)(_url|url)$/.test(key)) {
      return nested;
    }
    const found = findAudioUrl(nested);
    if (found) {
      return found;
    }
  }
  return undefined;
}
