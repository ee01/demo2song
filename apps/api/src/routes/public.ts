import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadValidatedConfig } from "@demo2song/config";
import type { PublicSong } from "@demo2song/shared";
import { repository } from "../db.js";
import { getObjectStorage } from "../storage/index.js";

const config = loadValidatedConfig();

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // 分享落地页用：无需登录，仅返回试听所需的最小信息（分享即视为公开）
  app.get("/public/songs/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const song = await repository.getSongById(id);
    if (!song) {
      return reply.code(404).send({ error: "SONG_NOT_FOUND" });
    }

    const playbackUrl =
      song.objectKey && song.status === "ready"
        ? await getObjectStorage().getPublicOrSignedUrl(song.objectKey, config.storage.signedUrlTtlSeconds)
        : undefined;

    const payload: PublicSong = {
      id: song.id,
      stage: song.stage,
      status: song.status,
      title: song.title,
      durationSeconds: song.durationSeconds,
      lyrics: song.lyrics,
      playbackUrl
    };

    return reply.send(payload);
  });
}
