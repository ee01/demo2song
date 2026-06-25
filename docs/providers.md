# Providers

All music providers must implement `MusicProvider` from `packages/shared/src/provider.ts`.

Current provider defaults:

- MiniMax: default MVP provider. Uses `music-cover-free` or configured MiniMax model with the humming recording as `audio_url`. Extension is approximate only.
- Mureka: target provider for precise melody upload and song extension. The adapter is wired behind the same contract, so switching provider is configuration-driven.

Provider switch checklist:

1. Set `defaultProvider` in `packages/config/config/demo2song.config.json`.
2. Add the provider API key to `.env` or deployment secrets.
3. Run `npm run config:validate`.
4. Run provider contract tests with `npm run test -w @demo2song/worker`.
