# Local development

1. Install dependencies.

   ```bash
   yarn install
   ```

   In mainland China, this may be faster:

   ```bash
   yarn install --registry https://registry.npmmirror.com
   ```

2. Copy environment variables.

   ```bash
   cp .env.example .env
   ```

3. Fill required services.

   - `CLOUDBASE_ENV_ID`: CloudBase environment id.
   - `CLOUDBASE_SECRET_ID`, `CLOUDBASE_SECRET_KEY`: optional for local development outside CloudRun when the SDK cannot use platform credentials.
   - `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, `COS_REGION`: Tencent Cloud COS.
   - `MINIMAX_API_KEY`: required for the default provider.
   - `WECHAT_APP_ID`, `WECHAT_APP_SECRET`: required outside dev mock login.
   - `WECHAT_LOGIN_STRICT`: keep `false` for local development so an invalid devtools code can fall back to a `dev_*` user; set `true` in production.

4. Create CloudBase collections.

   See `docs/cloudbase/collections.md`. CloudBase can create collections in the console; add the suggested indexes before real traffic.

5. Validate and run.

   ```bash
   yarn config:validate
   yarn typecheck
   yarn test
   yarn dev:api
   yarn dev:worker
   yarn dev:mp
   ```

For a provider-less UI smoke test, set `PROVIDER_MOCK_MODE=true`; COS and CloudBase are still required because recordings and generated files are persisted.
