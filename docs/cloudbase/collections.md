# CloudBase collections

CloudBase 云数据库保存业务元数据；腾讯云 COS 保存音频对象。

Create these collections in the CloudBase console:

- `users`
- `recordings`
- `songs`
- `song_jobs`
- `usage_quotas`
- `provider_events`

Recommended indexes:

- `users`: unique intent on `openId`.
- `recordings`: `id`, `userId`, `createdAt`.
- `songs`: `id`, `userId`, `recordingId`, `status`, `stage`, `createdAt`.
- `song_jobs`: `id`, `userId`, `status`, `createdAt`.
- `usage_quotas`: compound lookup intent on `userId`, `dateKey`, `kind`.
- `provider_events`: `provider`, `jobId`, `createdAt`.

The repository stores a generated public `id` field on every document. CloudBase also stores `_id`; application code queries by `id` so APIs stay stable if CloudBase document IDs are not exposed.

Important collection fields:

- `users`: `id`, `openId`, `sessionKey`, `createdAt`, `updatedAt`.
- `recordings`: `id`, `userId`, `objectKey`, `mimeType`, `durationSeconds`, `originalFilename`, `rawMeta`, `createdAt`, `updatedAt`.
- `songs`: `id`, `userId`, `recordingId`, `parentSongId`, `stage`, `status`, `provider`, `objectKey`, `mimeType`, `durationSeconds`, `lyrics`, `prompt`, `providerTaskId`, `providerRaw`, `costEstimateUsd`, `errorCode`, `errorMessage`, `createdAt`, `updatedAt`.
- `song_jobs`: `id`, `userId`, `recordingId`, `songId`, `kind`, `status`, `provider`, `requestPayload`, `lockedAt`, `errorCode`, `errorMessage`, `createdAt`, `updatedAt`.
- `usage_quotas`: `id`, `userId`, `dateKey`, `kind`, `used`, `createdAt`, `updatedAt`.
- `provider_events`: `id`, `provider`, `jobId`, `eventType`, `payload`, `createdAt`, `updatedAt`.
