// Build-time string literals injected by wrangler `--define`. Three sites:
//
//   VERSION:
//     - Production deploys: `wrangler --define VERSION:'"<version>"'` in
//       the deploy companion's deploy-on-release.yml, sourced from package.json.
//     - Local `wrangler dev`: wrangler.toml `[define]` default.
//     - Tests: same [define] flows through @cloudflare/vitest-pool-workers.
//
//   CONFIGS_JSON:
//     A JSON.stringify()-safe string, itself the JSON-encoded form of
//     `Record<token, RawConfig>`. Produced at deploy time by the deploy
//     companion's workflow reading every config/people/*.yaml file, then
//     passed via `wrangler --define CONFIGS_JSON:'"..."'`.
//     Empty object ({}) in dev + tests — feed-handler.ts responds 404 to
//     every token until a real deploy runs.
//
// Both are bare globals, not properties on `env`, because Terraform owns
// the runtime `env.*` bindings and `wrangler deploy --keep-vars` would
// refuse to touch them. Build-time define sidesteps that ownership.
declare const VERSION: string;
declare const CONFIGS_JSON: string;
