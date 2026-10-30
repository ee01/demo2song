import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { normalizeReferenceAudioToMp3, providerResultToBuffer } from "./audio.js";

describe("providerResultToBuffer", () => {
  it("decodes hex audio", async () => {
    await expect(
      providerResultToBuffer({
        provider: "minimax",
        audioHex: Buffer.from("audio").toString("hex"),
        mimeType: "audio/mpeg",
        raw: {}
      })
    ).resolves.toEqual(Buffer.from("audio"));
  });

  it("decodes base64 audio", async () => {
    await expect(
      providerResultToBuffer({
        provider: "minimax",
        audioBase64: Buffer.from("audio").toString("base64"),
        mimeType: "audio/mpeg",
        raw: {}
      })
    ).resolves.toEqual(Buffer.from("audio"));
  });

  it("normalizes opus webm reference audio to mp3", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "demo2song-audio-test-"));
    const inputPath = path.join(workDir, "input.webm");
    const outputPath = path.join(workDir, "output.mp3");

    try {
      await run("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=7",
        "-c:a",
        "libopus",
        inputPath
      ]);
      const mp3 = await normalizeReferenceAudioToMp3(await readFile(inputPath));
      await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, mp3));
      const codec = await run("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=nw=1:nk=1",
        outputPath
      ]);
      expect(codec.trim()).toBe("mp3");
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

async function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} failed with exit code ${code}: ${stderr}`));
    });
  });
}

it("writes an AIGC ID3 frame without stacking existing ID3 prefixes", async () => {
  const { markAIGC } = await import("./audio.js");
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x44]); const first = markAIGC(audio); const second = markAIGC(first);
  expect(first.subarray(0,3).toString()).toBe("ID3"); expect(first.includes(Buffer.from("AIGC\0true"))).toBe(true); expect(second).toEqual(first); expect(first.subarray(-4)).toEqual(audio);
});
