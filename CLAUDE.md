# hijri-cadence

Context file for AI coding agents working on this repository. Humans: see `README.md`.

## Purpose

`hijri-cadence` converts a static, human-edited list of Hijri-calendar
events (birthdays, anniversaries, religious dates) into an always-current
`webcal://` calendar subscription. Because a Hijri-yearly event has no fixed
Gregorian offset, the Worker materializes individual `VEVENT`s for a rolling
range of years on every request rather than emitting an `RRULE`.

This is the **public source repo**. It holds the Worker source, the
`HijriCalendarProvider` interface + default Umm al-Qura implementation,
tests (including a local CLI and example config for testing), Terraform
_module_, and the release flow. Production deploys — including all real
event data — happen in a separate **private deploy companion** repo,
`hijri-cadence-deploy`, that holds account-specific values, per-person
config, and the secrets they resolve from.

## Architecture

```
public (this repo)                private (deploy companion)
  worker/src/            ───┐     config/people/*.yaml (real events + tokens)
  infrastructure/tf/     ───┤     config/deploy.env (non-secrets)
  examples/               ──┤     GitHub Secrets (CF, Healthchecks.io, ...)
  release-please             │     deploy-on-release.yml
       ↓                     │
  tag vX.Y.Z + release       │
       ↓                     │
  notify-deploy.yml ───────dispatch───→ deploy-on-release.yml
                                          ├── terraform apply
                                          ├── wrangler deploy   --define VERSION
                                          └── push Healthchecks.io heartbeat
```

The deploy repo checks out both itself (config + secrets) and this repo
(Terraform module + Worker source) at the released ref, and stitches them at
deploy time — same "two-checkout dance" as FluxTube.

## Tech Stack

Pinned versions — don't drift without explicit instruction:

- **Runtime:** Cloudflare Workers (V8 isolate, not Node.js)
- **Language:** TypeScript, strict mode
- **State:** none — static YAML config, bundled at build time. No D1/KV in v1.
- **Scheduling:** Cloudflare Cron Trigger — runs the golden-vector self-check
  - Healthchecks.io heartbeat
- **Package manager:** pnpm workspaces — `worker`, `scripts` (if/when needed)
- **Calendar conversion:** `@tabby_ai/hijri-converter` (Umm al-Qura,
  zero-dependency, TypeScript-first) behind the `HijriCalendarProvider`
  interface — never call it directly outside `providers/umm-al-qura.ts`
- **Config validation:** zod
- **IaC:** Terraform, Cloudflare provider — resource names prefixed with the
  route/subdomain, module lives here, environment + state lives in the
  deploy repo
- **CI/CD:** GitHub Actions
- **Versioning & releases:** release-please reading Conventional Commits
- **Testing:** Vitest with `@cloudflare/vitest-pool-workers`
- **Formatting:** Prettier (2-space, single quotes)
- **Linting:** ESLint flat config with `typescript-eslint`

## Repository Layout

```
.
├── README.md
├── CLAUDE.md / AGENTS.md              # this file (mirrored)
├── SECURITY.md
├── LICENSE                             # MIT
├── CHANGELOG.md                        # release-please owned
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
├── tsconfig.base.json, eslint.config.js, .prettierrc
├── release-please-config.json, .release-please-manifest.json
├── .github/
│   ├── workflows/
│   │   ├── pr-checks.yml               # typecheck + lint + test (Tier 1 only) + audit
│   │   ├── terraform-check.yml         # terraform fmt -check + validate
│   │   ├── release-please.yml
│   │   └── notify-deploy.yml           # release published → dispatch to deploy repo
│   └── dependabot.yml
├── docs/
│   ├── architecture.md                 # occurrence generation, provider interface, ICS shape
│   └── setup.md                        # local-dev quick start
├── examples/
│   └── events.example.yaml             # fictitious — used by tests + `make ical-local`
├── infrastructure/terraform/
│   └── _modules/hijri-cadence-environment/
│       ├── worker.tf, dns.tf, variables.tf, outputs.tf, locals.tf
└── worker/
    ├── package.json, wrangler.toml     # PLACEHOLDER resource ids — Terraform sets real bindings
    ├── vitest.config.ts
    ├── .dev.vars.example
    ├── src/
    │   ├── index.ts                    # scheduled + fetch handlers
    │   ├── providers/
    │   │   ├── provider.ts             # HijriCalendarProvider interface
    │   │   └── umm-al-qura.ts          # default implementation
    │   ├── occurrences.ts              # config → occurrence list (pure, no Worker deps)
    │   ├── ics.ts                      # occurrence list → ICS text (pure, RFC 5545)
    │   ├── config.ts                   # YAML parse/validate (zod)
    │   ├── feed-handler.ts             # GET /feed/<token>.ics
    │   ├── healthcheck.ts              # golden-vector self-check + Healthchecks.io ping
    │   ├── logger.ts                   # structured JSON logging — no console.log elsewhere
    │   ├── cli.ts                      # local ICS generation entry point
    │   └── globals.d.ts                # declare const VERSION (--define injected)
    └── test/
        ├── conversion.test.ts          # golden-vector unit tests (Tier 1)
        ├── occurrences.test.ts
        ├── ics.test.ts
        └── spot-check/
            └── aladhan.spotcheck.ts    # Tier 3 — NOT run in pr-checks.yml, network-dependent
```

## Conventions

- **Commits**: Conventional Commits. `feat:`, `fix:`, `chore:`, `docs:`,
  `ci:`, `refactor:`, `test:`. release-please reads these for version bumps.
- **Strictness**: `"strict": true`. No implicit any. No non-null assertions
  (`!`) — narrow properly. Use `unknown` for external JSON (config, API
  responses), narrow with type guards or zod.
- **Naming**: `camelCase` vars/funcs, `PascalCase` types,
  `SCREAMING_SNAKE_CASE` env-backed constants.
- **No barrel files** except the Worker entrypoint.
- **Logging**: one JSON line per significant event, via `logger.ts` only.
  Required fields: `ts`, `level`, `event`, `version`. Token is always hashed
  before logging, never logged raw.
- **Testing tiers** (see `docs/architecture.md` for the full rationale):
  - Tier 1 (`worker/test/*.test.ts`): CI-gated, no network, runs in
    `pr-checks.yml`.
  - Tier 2 (runtime self-check via `healthcheck.ts`): runs inside the
    deployed Worker on the Cron Trigger, not in CI.
  - Tier 3 (`worker/test/spot-check/`): third-party validation against the
    Aladhan API. Manual (`make spot-check` in the deploy repo) or a
    low-frequency scheduled Action — **never** part of `pr-checks.yml**.
- **No real identifiers in tracked files**: `wrangler.toml` resource IDs are
  placeholders; Terraform sets the real bindings. No account ID, no real
  domain/route value, no real event data anywhere in this repo, ever.
- **Terraform**: `terraform fmt -recursive` clean at all times; CI enforces.

## Public-side CI

| Workflow              | Trigger                                   | What                                                  |
| --------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `pr-checks.yml`       | PR                                        | typecheck + lint + Tier 1 tests + audit               |
| `terraform-check.yml` | PR touching `infrastructure/terraform/**` | `fmt -check` + `validate`                             |
| `release-please.yml`  | push to main                              | Maintains the release PR via Conventional Commits     |
| `notify-deploy.yml`   | `release: published`                      | Fires `repository_dispatch` to `hijri-cadence-deploy` |

Auth surface: this repo holds **exactly one secret**,
`DEPLOY_DISPATCH_TOKEN` — a fine-scoped PAT with `repository_dispatch:write`
on the deploy companion repo only. Compromise lets an attacker redeploy
already-released code, nothing more.

## What lives in the deploy companion (not here)

- `config/people/*.yaml` — real event data (names, Hijri dates, tokens) per
  person/family
- `config/deploy.env` — real Cloudflare account ID, route/subdomain, cron
  schedule
- Worker secrets: Healthchecks.io ping URL, any provider-specific keys
- `deploy-on-release.yml` (consumes the dispatch, runs `terraform apply` +
  `wrangler deploy`)
- `terraform-apply.yml` — manual `workflow_dispatch` entrypoint
- Ops scripts touching the password manager: `sync-github-secrets.sh`,
  `sync-worker-secrets.sh`, `bootstrap-local-tf.sh`
- The Makefile driving all local operations (setup/secrets/deploy/clean/
  destroy/spot-check) — see that repo's own `CLAUDE.md` once scaffolded
- Operator runbook (`TODO.md`, `docs/bootstrap.md`)

## Non-goals

Out of scope; will be rejected without a new requirements discussion:

- Moon-sighting-based dates — this is a scheduling tool, not a fiqh
  authority. See README disclaimer.
- Write access / two-way calendar sync
- A UI for populating dates in v1 (tracked as a GitHub Issue for v2)
- Passkey/WebAuthn auth in v1 (tracked as a GitHub Issue for v2)
- Dates outside 1343–1500 AH (1924–2077 CE)
- Multi-calendar output in a single feed — one `calendar` provider per config
  file; someone wanting two authorities runs two configs

## References

- Aladhan API (Tier 3 spot-check source): https://aladhan.com/islamic-calendar-api
- `@tabby_ai/hijri-converter`: https://github.com/tabby-ai/hijri-converter
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Healthchecks.io HTTP API: https://healthchecks.io/docs/http_api/
- release-please: https://github.com/googleapis/release-please
