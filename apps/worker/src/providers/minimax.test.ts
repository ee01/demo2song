import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env.js";
import { MiniMaxProvider } from "./minimax.js";

function stubMusicResponse() {
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    new Response(
      JSON.stringify({
        data: { audio: "https://cdn.test/generated.mp3", status: 2 },
        trace_id: "trace-1",
        extra_info: { music_duration: 42000 },
        base_resp: { status_code: 0, status_msg: "success" }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, options] = fetchMock.mock.calls[0];
  if (!options) {
    throw new Error("MiniMax request options are missing");
  }
  return JSON.parse(String(options.body)) as Record<string, unknown>;
}

describe("MiniMaxProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends normalized audio_base64 for cover generation and returns a URL", async () => {
    env.MINIMAX_API_KEY = "test-key";
    env.MINIMAX_API_BASE = "https://api.test";
    env.PROVIDER_MOCK_MODE = false;
    const fetchMock = stubMusicResponse();

    const result = await new MiniMaxProvider().createDemoSong({
      userId: "user-1",
      recording: {
        objectKey: "recordings/user-1/take.mp3",
        signedUrl: "https://storage.test/take.mp3?signature=1",
        audioBase64: "normalized-mp3-base64",
        mimeType: "audio/mpeg",
        durationSeconds: 12
      },
      prompt: {
        style: "dreamy synth pop",
        language: "zh",
        vocalGender: "female"
      },
      lyrics: "测试歌词",
      targetDurationSeconds: 30
    });

    const body = requestBody(fetchMock);
    expect(body.model).toBe("music-cover");
    expect(body.audio_base64).toBe("normalized-mp3-base64");
    expect(body).not.toHaveProperty("audio_url");
    expect(body.output_format).toBe("url");
    expect(result.audioUrl).toBe("https://cdn.test/generated.mp3");
    expect(result.audioHex).toBeUndefined();
  });

  it("does not send reference audio for text-to-music full songs", async () => {
    env.MINIMAX_API_KEY = "test-key";
    env.MINIMAX_API_BASE = "https://api.test";
    env.PROVIDER_MOCK_MODE = false;
    const fetchMock = stubMusicResponse();

    await new MiniMaxProvider().createFullSong({
      userId: "user-1",
      recording: {
        objectKey: "recordings/user-1/take.mp3",
        signedUrl: "https://storage.test/take.mp3?signature=1",
        audioBase64: "should-not-be-sent",
        mimeType: "audio/mpeg",
        durationSeconds: 12
      },
      prompt: {
        style: "dreamy synth pop",
        language: "zh",
        vocalGender: "female"
      },
      lyrics: "[Verse]\n测试歌词\n[Chorus]\n副歌",
      targetDurationSeconds: 120
    });

    const body = requestBody(fetchMock);
    expect(body.model).toBe("music-2.6");
    expect(body).not.toHaveProperty("audio_url");
    expect(body).not.toHaveProperty("audio_base64");
    expect(body.lyrics).toContain("测试歌词");
    expect(body.output_format).toBe("url");
  });

  it("maps the retired free Music API error for the mini program", () => {
    const normalized = new MiniMaxProvider().normalizeError(
      new Error(
        "This Music API is no longer available to new users. Existing paying customers can continue to use the service."
      )
    );
    expect(normalized.code).toBe("MINIMAX_ERROR");
    expect(normalized.message).toContain("免费音乐接口已下线");
  });
});
