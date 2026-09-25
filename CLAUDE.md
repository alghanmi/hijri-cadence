# hijri-cadence

Context file for AI coding agents working on this repository. Humans: see `README.md`.
`AGENTS.md` is a symlink to this file.

## Purpose

`hijri-cadence` converts a static, human-edited list of Hijri-calendar
events (birthdays, anniversaries, religious dates) into an always-current
`webcal://` calendar subscription. A Hijri-yearly event has no fixed
Gregorian offset, so the Worker materializes individual `VEVENT`s for a
rolling range of years on every request rather than emitting an `RRULE`.

This is the **public source repo**. It holds:

- the Worker source
- the `HijriCalendarProvider` interface + default Umm al-Qura implementation
- tests (plus a local CLI and a fictitious example config)
- the deploy-time config bundler
- the Terraform _module_
- the release flow

Production deploys, including all real event data, happen in a separate
**private deploy companion** repo that holds per-person configs,
account-specific values, and the credentials they resolve from.

## Architecture

```
public (this repo)                     private deploy companion
  worker/src/  ─────────────┐            config/people/*.yaml  (real events + tokens)
  infrastructure/tf module ─┤            config/deploy.env     (non-secret values)
  release-please            │            GitHub env secrets    (CF token, R2 keys)
       ↓                    │            deploy workflow
  merge release PR          │
       ↓                    │
  release-please.yml ──repository_dispatch──→ deploy workflow
                                              ├── bundle-configs (validate + bundle)
                                              ├── terraform apply
                                              ├── wrangler deploy --name <script>
                                              │     --define VERSION / CONFIGS_JSON
                                              └── smoke test the live hostname
```

The deploy workflow checks out both repos (the companion at HEAD; this
repo at the released tag) and stitches them at deploy time. Merging a
config change in the companion runs the same workflow against the latest
release. `notify-deploy.yml` here is only a manual escape hatch.

Ownership split: **Terraform** owns the Worker entity via the code-less
`cloudflare_worker` resource (observability, workers.dev off), the custom
domain, and the **cron trigger**. **wrangler** owns the code, the
compatibility date/flags (`wrangler.toml`), and the plain-text vars (passed
with `--var`). Terraform must never manage the code: the old
`cloudflare_workers_script` downloaded the bundle on every refresh and broke
once wrangler replaced it. Never add `[triggers]` to `wrangler.toml`, since
wrangler would overwrite the Terraform cron on every deploy. The
`[observability]` table is the opposite case: it **must** exist and mirror
the module's `cloudflare_worker.observability`, because every script upload
resets omitted observability settings to off.

## Tech Stack

Versions live in `package.json` / `worker/package.json` and the Terraform
`versions.tf`. Resolve current versions from the registry before bumping
anything (see the global dependency-currency rule).

- **Runtime:** Cloudflare Workers (V8 isolate, not Node.js)
- **Language:** TypeScript, strict mode
- **State:** none. Configs are bundled at build time via `--define`; no
  D1/KV in v1.
- **Scheduling:** a Cloudflare cron trigger (Terraform-managed) runs the
  golden-vector self-check + Healthchecks.io heartbeat.
- **Package manager:** pnpm workspace (`worker`)
- **Calendar conversion:** `@tabby_ai/hijri-converter` (Umm al-Qura)
  behind the `HijriCalendarProvider` interface. Never call it directly
  outside `providers/umm-al-qura.ts`.
- **Config validation:** zod (`config.ts`); deploy-time bundling in
  `bundle.ts` / `bundle-cli.ts`
- **IaC:** Terraform, Cloudflare provider v5. Resource names are
  prefixed `hijri-cadence-<instance_id>`. The module lives here; the
  environment + state live in the companion.
- **CI/CD:** GitHub Actions
- **Versioning & releases:** release-please reading Conventional Commits
- **Testing:** Vitest with `@cloudflare/vitest-pool-workers` (vitest held
  at 4.x; see the ignore rule in `.github/dependabot.yml`)
- **Formatting:** Prettier (2-space, single quotes)
- **Linting:** ESLint flat config with `typescript-eslint`
- **Operations:** `Makefile`. Every documented local operation is a
  `make` target.

## Repository Layout

```
.
├── README.md, SECURITY.md, LICENSE (MIT), CLAUDE.md (+ AGENTS.md symlink)
├── Makefile                            # every local operation (`make help`)
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
├── tsconfig.base.json, eslint.config.js, .prettierrc
├── release-please-config.json, .release-please-manifest.json
├── .github/
│   ├── workflows/
│   │   ├── pr-checks.yml               # typecheck, lint, format, Tier 1 tests, bundle dry-run, audit
│   │   ├── terraform-check.yml         # terraform fmt -check + validate
│   │   ├── release-please.yml          # release PR; on release → dispatch to the companion
│   │   └── notify-deploy.yml           # manual workflow_dispatch: re-dispatch an existing tag
│   └── dependabot.yml
├── docs/
│   ├── architecture.md                 # how it works (source of truth)
│   ├── setup.md                        # local-dev guide
│   └── design/hijri-cadence-design.md  # historical design draft
├── examples/events.example.yaml        # fictitious; used by tests, `make ical`
├── infrastructure/terraform/_modules/hijri-cadence-environment/
│   └── versions.tf, variables.tf, locals.tf, worker.tf, dns.tf, outputs.tf
└── worker/
    ├── package.json, wrangler.toml     # no real ids; no [triggers] (Terraform owns cron)
    ├── vitest.config.ts, tsconfig.json, .dev.vars.example
    ├── src/
    │   ├── index.ts                    # fetch + scheduled handlers
    │   ├── providers/{provider,umm-al-qura}.ts
    │   ├── config.ts                   # zod schemas (config, personConfigSchema w/ token)
    │   ├── occurrences.ts              # config → occurrences (pure; day-30 fallback)
    │   ├── hijri-months.ts             # month names for notes
    │   ├── ics.ts                      # occurrences → RFC 5545 (pure)
    │   ├── feed-handler.ts             # GET/HEAD /feed/<token>.ics
    │   ├── healthcheck.ts              # golden-vector self-check + Healthchecks.io ping
    │   ├── bundle.ts, bundle-cli.ts    # deploy-time config validation + bundling
    │   ├── cli.ts                      # `make ical`
    │   ├── logger.ts, types.ts, globals.d.ts
    └── test/
        ├── *.test.ts                   # Tier 1 (CI-gated, no network)
        ├── fixtures.ts                 # inline copy of the example config (workerd has no fs)
        └── spot-check/aladhan.spotcheck.ts   # Tier 3 — never in CI
```

## Conventions

- **Branches + PRs only.** Never commit or push to `main`; squash-merge
  PRs. The PR title is the Conventional Commit subject on `main`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `ci:`, `refactor:`, `test:`). release-please reads them for version
  bumps. Tooling/CI/docs are `chore:`/`docs:`, not `feat:`.
- **Strictness:** `"strict": true`. No implicit any. No non-null
  assertions (`!`); narrow properly. Use `unknown` for external JSON and
  narrow with type guards or zod.
- **Naming:** `camelCase` vars/funcs, `PascalCase` types,
  `SCREAMING_SNAKE_CASE` env-backed constants.
- **No barrel files** except the Worker entrypoint.
- **Logging:** one JSON line per significant event, via `logger.ts`
  only. Required fields: `ts`, `level`, `event`, `version`, `instance`.
  Tokens are always hashed before logging, never logged raw.
- **Personal data:** diagnostics (validation, bundling, logs) report file
  names and field paths, never config values.
- **Testing tiers** (full rationale in `docs/architecture.md`):
  - Tier 1 (`worker/test/*.test.ts`): CI-gated, no network (`make test`).
  - Tier 2 (runtime self-check via `healthcheck.ts`): runs in the
    deployed Worker on the cron trigger, not in CI.
  - Tier 3 (`worker/test/spot-check/`): Aladhan API cross-check,
    `make spot-check` on demand. **Never** part of `pr-checks.yml`.
- **No real identifiers in tracked files:** no account/zone IDs, no real
  event data, no tokens. `wrangler.toml` holds only local-dev defaults.
- **Terraform:** `make tf-check` clean at all times (CI enforces fmt +
  validate). Outputs read attributes of created resources, not inputs.
- **Work tracking:** open, deferred, and operator work is tracked as
  issues in the private companion. Public PRs, commits, and issues never
  reference those issues, the companion's name, or its URL.

## Public-side CI

| Workflow              | Trigger                                   | What                                                               |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `pr-checks.yml`       | PR                                        | typecheck, lint, format, Tier 1 tests, bundle dry-run build, audit |
| `terraform-check.yml` | PR touching `infrastructure/terraform/**` | `fmt -check` + `validate`                                          |
| `release-please.yml`  | push to main                              | Maintains the release PR; on release, dispatches the deploy        |
| `notify-deploy.yml`   | manual `workflow_dispatch`                | Re-dispatches `deploy-release` for an existing tag                 |

Auth surface: this repo holds **exactly one secret** (in its `production`
environment), `DEPLOY_DISPATCH_TOKEN`: a fine-grained PAT with
Contents: read & write on the companion repo only, which is what gates
`repository_dispatch`. A leak lets an attacker redeploy already-released
code, nothing more.

## What lives in the deploy companion (not here)

- `config/people/*.yaml`: real event data + tokens (committed there,
  validated in its CI)
- `config/deploy.env`: non-secret values: account + zone IDs, hostname,
  `instance_id`, state bucket/key, cron schedule, log level, and the
  **Healthchecks.io ping URL** (`TF_VAR_heartbeat_url`, deliberately not
  a secret)
- The Terraform environment + lock file
- The deploy workflow (dispatch + config-change triggers)
- Credential sync (password manager → GitHub environment secrets: the CF
  API token and R2 keys) and the local Terraform bootstrap script
- Its own `Makefile` for all operations (secrets, plan/apply, deploy,
  verify, validate, person scaffolding)
- Operator runbook and the issue tracker for this project

There are **no Worker secrets**: the only bindings are three plain-text vars
that the deploy passes to `wrangler deploy --var`.

## Non-goals

These are out of scope and will be rejected without a new requirements
discussion:

- Moon-sighting-based dates. This is a scheduling tool, not a fiqh
  authority; see the README disclaimer.
- Write access / two-way calendar sync
- A UI for populating dates in v1 (v2 backlog)
- Passkey/WebAuthn auth in v1 (v2 backlog)
- Dates outside 1343–1500 AH (1924–2077 CE)
- Multi-calendar output in a single feed: one `calendar` provider per
  config file. Anyone wanting two authorities runs two configs.

## References

- Aladhan API (Tier 3 spot-check source): https://aladhan.com/islamic-calendar-api
- `@tabby_ai/hijri-converter`: https://github.com/tabby-ai/hijri-converter
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Healthchecks.io HTTP API: https://healthchecks.io/docs/http_api/
- release-please: https://github.com/googleapis/release-please
