import { describe, expect, it, vi } from "vitest";
import { buildLyricsPrompt, generateLyricsDraft } from "./minimax-lyrics.js";

const prompt = {
  style: "民谣",
  mood: "温暖",
  language: "zh" as const,
  vocalGender: "female" as const,
  description: "毕业那年的夏天",
  lyricSeed: "风吹过旧街角"
};

describe("MiniMax lyrics generation", () => {
  it("builds a prompt from all editable song fields", () => {
    expect(buildLyricsPrompt(prompt)).toContain("曲风：民谣");
    expect(buildLyricsPrompt(prompt)).toContain("情绪：温暖");
    expect(buildLyricsPrompt(prompt)).toContain("人声：女声");
    expect(buildLyricsPrompt(prompt)).toContain("风吹过旧街角");
  });

  it("calls lyrics_generation without a model selector", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          song_title: "盛夏以前",
          lyrics: "[Verse]\n风吹过旧街角",
          style_tags: "Folk, Warm",
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      generateLyricsDraft(prompt, {
        apiKey: "test-key",
        apiBase: "https://api.test/",
        fetchImpl
      })
    ).resolves.toEqual({
      title: "盛夏以前",
      lyrics: "[Verse]\n风吹过旧街角",
      styleTags: "Folk, Warm"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.test/v1/lyrics_generation");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.mode).toBe("write_full_song");
    expect(body.model).toBeUndefined();
  });
});
