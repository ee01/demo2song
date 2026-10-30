import type { Demo2SongRepository, IdentityProvider, IdentityRecord } from "@demo2song/data";

async function liveUserId(repo: Demo2SongRepository, userId: string, depth = 0): Promise<string> {
  if (depth > 3) return userId;
  const user = await repo.getUserById(userId);
  if (user?.mergedInto) return liveUserId(repo, user.mergedInto, depth + 1);
  return userId;
}

async function attachIdentity(
  repo: Demo2SongRepository,
  userId: string,
  provider: IdentityProvider,
  openid: string,
  unionId?: string
): Promise<IdentityRecord> {
  const existing = await repo.findIdentity(provider, openid);
  if (existing) {
    const patch: Partial<IdentityRecord> = {};
    if (unionId && existing.unionId !== unionId) patch.unionId = unionId;
    if (existing.userId !== userId) patch.userId = userId;
    if (Object.keys(patch).length > 0) await repo.updateIdentity(existing.id, patch);
    return existing;
  }
  return repo.createIdentity({
    userId,
    provider,
    subject: openid,
    ...(unionId ? { unionId } : {})
  });
}

async function foldUnionInto(repo: Demo2SongRepository, canonicalUserId: string, unionId: string): Promise<void> {
  const linked = await repo.listIdentitiesByUnionId(unionId);
  const others = [...new Set(linked.map((identity) => identity.userId).filter((userId) => userId !== canonicalUserId))];
  for (const otherId of others) {
    await repo.reassignUserData(otherId, canonicalUserId);
    for (const identity of await repo.listIdentitiesForUser(otherId)) {
      await repo.updateIdentity(identity.id, { userId: canonicalUserId });
    }
    await repo.revokeSessionsForUser(otherId);
    await repo.updateUser(otherId, { mergedInto: canonicalUserId });
  }
}

export async function resolveWechat(
  repo: Demo2SongRepository,
  provider: "wechat_mp" | "wechat_app",
  openid: string,
  unionId?: string
): Promise<string> {
  const direct = await repo.findIdentity(provider, openid);
  if (direct) {
    if (unionId && direct.unionId !== unionId) {
      await repo.updateIdentity(direct.id, { unionId });
    }
    if (provider === "wechat_mp" && unionId) {
      await foldUnionInto(repo, direct.userId, unionId);
    }
    return liveUserId(repo, direct.userId);
  }

  if (provider === "wechat_mp") {
    const legacy = await repo.findUserByOpenId(openid);
    if (legacy) {
      await attachIdentity(repo, legacy.id, provider, openid, unionId);
      if (unionId) await foldUnionInto(repo, legacy.id, unionId);
      return legacy.id;
    }
  }

  if (unionId) {
    const linked = await repo.findIdentityByUnionId(unionId);
    if (linked) {
      const userId = await liveUserId(repo, linked.userId);
      await attachIdentity(repo, userId, provider, openid, unionId);
      if (provider === "wechat_mp") await foldUnionInto(repo, userId, unionId);
      return userId;
    }
  }

  const created =
    provider === "wechat_mp" ? await repo.upsertUserByOpenId(openid) : await repo.createUser();
  await attachIdentity(repo, created.id, provider, openid, unionId);
  return created.id;
}
