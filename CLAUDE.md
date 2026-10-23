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

Deployment happens outside this repository. Per-person configs,
account-specific values and the credentials they resolve from are supplied
at deploy time and never committed here.

## Architecture

```
this repo
  worker/src/, infrastructure/terraform module, release-please
       ↓
  merge release PR
       ↓
  release-please.yml ──repository_dispatch──→ DEPLOY_TARGET_REPO (deployment, outside this repo)
                                              ├── bundle-configs (validate + bundle)
                                              ├── terraform apply
                                              ├── wrangler deploy --name <script>
                                              │     --define VERSION / CONFIGS_JSON
                                              └── smoke test the live hostname
```

A config change alone redeploys the latest release through the same steps.
`notify-deploy.yml` here is only a manual escape hatch.
`docs/architecture.md` → _Deploying_ has the details.

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
  environment + state live with the deployment.
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
│   │   ├── release-please.yml          # release PR; on release → dispatch to DEPLOY_TARGET_REPO
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
- **Work tracking:** operational and security work is tracked outside
  this repository. Issues here describe symptoms only, and PRs, commits
  and issues never reference anything outside this repository.

## Documentation

`README.md` is the manual (shared rule _Documentation: the README is the manual_ below): how it works, the config fields, every `make` target, and the self-hosting deploy steps in general terms. When a change adds a target, a config field, a binding, a secret or a deploy step, update the README in the same PR, and keep `docs/architecture.md` → _Deploying_ in step with it. `make check` and `pr-checks.yml` run `make docs-check`.

## Public-side CI

| Workflow              | Trigger                                   | What                                                               |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `pr-checks.yml`       | PR                                        | typecheck, lint, format, Tier 1 tests, bundle dry-run build, audit |
| `terraform-check.yml` | PR touching `infrastructure/terraform/**` | `fmt -check` + `validate`                                          |
| `release-please.yml`  | push to main                              | Maintains the release PR; on release, dispatches the deploy        |
| `notify-deploy.yml`   | manual `workflow_dispatch`                | Re-dispatches `deploy-release` for an existing tag                 |

Auth surface: this repo holds **one credential** (in its `production`
environment), `DEPLOY_DISPATCH_TOKEN`: a fine-grained PAT with
Contents: read & write on the target repository only, which is what gates
`repository_dispatch`. A leak lets an attacker redeploy already-released
code, nothing more. `DEPLOY_TARGET_REPO`, the dispatch destination, is
also an environment secret: it grants nothing, and is a secret only so no
workflow or log spells the destination out.

## What does not live here

Real per-person configs and tokens, account and zone IDs, the Terraform
environment and state, the deploy pipeline, credential tooling and the
operator runbook all live with the deployment, outside this repository. If
a task here seems to need any of them, it belongs there.

The Worker has one secret, `HEARTBEAT_URL` (the Healthchecks.io ping URL:
whoever holds it can ping the check, so it is a credential, set with
`wrangler secret put`), and two plain-text vars, `INSTANCE_ID` and
`LOG_LEVEL`, that the deploy passes to `wrangler deploy --var`.

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

<!-- shared-conventions-public: v2 (2026-10-18). One source, copied verbatim into
     every public repo's CLAUDE.md. Edit the source and re-sync; never edit a
     copy in place. Repo-specific rules elsewhere in this file override it. -->

## Shared conventions (public repository)

**Classification: public.** This repository is public or written to be
published. Every file, commit message, PR, issue, comment and workflow log is
permanent public record: rewriting history does not unsend notification email
or remove a commit reachable from a PR. The rest of this file adds rules for
this repo; where they conflict, the stricter rule wins.

### What never appears here

- **Anything about where or how this project is operated.** No other
  repository that deploys, configures or monitors it is named, linked,
  described or implied. Say only that deployment happens outside this
  repository.
- **The operator's tooling and vendors.** No password manager, secrets store,
  monitoring or hosting account, beyond the services the published source
  itself integrates with.
- **Identifiers.** No hostnames, account or zone IDs, resource UUIDs, bucket
  names, instance URLs, personal paths, or contact details outside a
  deliberate `SECURITY.md`. Configs carry placeholders.
- **The specifics of one deployment's security.** Which of our credentials
  does what, which account or vault item holds it, where our trust boundaries
  sit, what we deliberately leave unmonitored. Describe symptoms and fixes,
  never the map.

### What belongs here

- **The software's security model, in general terms.** `SECURITY.md` and
  docs describe what the project protects and how: authentication,
  encryption at rest, which secrets an operator must provide and why,
  least-privilege token scopes, the threat model, and how to report a
  vulnerability. That is what lets a stranger run it safely. It is written
  for any deployment, never as a description of ours.
- **Tooling that helps a contributor or operator do the work**, under the
  rules below.

Before pushing, read the diff, the commit message and the PR body once with
the question "what does this tell someone who wants to attack the deployment
that they did not already know?"

### Tooling and the Makefile

- **Tooling is welcome; specifics are not.** A `Makefile` and scripts may do
  anything a contributor or a self-hosting operator needs: build, test,
  generate docs, run Terraform, deploy. Every value comes from the
  environment or a gitignored file the operator creates from a committed
  `*.example`; nothing names our accounts, hosts, vault items or other
  repositories. Read every target as a stranger would run it.
- **The Makefile is the interface where one exists.** Each target has a
  `## description` and is listed by `make help` (the first target); README
  usage documents targets, not raw commands. Thin recipes over
  `set -euo pipefail` scripts; `printf`, never `echo -e`; parameters are
  upper-case make variables validated with a working example.
- **No target prompts**, and a target that changes live state without a
  saved, reviewed plan requires `CONFIRM=1`.
- **Common target names**, used whenever the operation exists:
  `help`, `install`, `dev`, `fmt`/`format`, `lint`, `typecheck`, `test`,
  `check` (everything CI runs), `docs`, `tf-check` (`fmt -check` +
  `validate -backend=false`), `tf-upgrade` (provider upgrade + lock for
  `linux_amd64` and `darwin_arm64`), `clean`.
- **CI needs no secret beyond what the release mechanism requires**, and
  the release mechanism's destination is itself a secret: a dispatch target
  is read from `secrets.*`, never written into a workflow.

### Documentation: the README is the manual

- **The README runs the project from a fresh clone.** It covers what the
  project does, its architecture (a Mermaid diagram wherever a flow is easier
  to see than to read), local development, every `make` target or root
  `package.json` script, and how a self-hosting operator deploys it: the
  resources, the secrets to provide, the order. It describes any deployment
  in general terms, never ours.
- **Every change reviews the README.** Before opening a PR, read the README
  sections the change touches against the diff. A new, renamed or removed
  target, script, variable, secret, workflow or deploy step updates the
  README in the same PR, never in a follow-up.
- **`docs-check` enforces the mechanical half** (`make docs-check`, or
  `pnpm docs:check` where there is no Makefile). It fails when a documented
  target or root script is missing from the README, or a relative link points
  at nothing. CI runs it. Only reading catches a stale procedure.

### Git and pull requests

- **Never commit or push to `main`.** Every change starts on a branch from an
  up-to-date `main` and lands through a pull request. No hotfix exception.
- **Branch names** use the Conventional Commit type as prefix:
  `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`.
- **Squash-merge only.** The PR title becomes the commit subject on `main`,
  so it must be a valid Conventional Commit subject on its own. Commit bodies
  survive the squash, so the reasoning belongs in the commits too.
- **The prefix is a release decision.** `feat:` only for a change a user of
  the released artifact would notice; tooling, CI and docs are
  `chore:`/`ci:`/`docs:`. State the intended bump in the PR.
- **Squash destroys ancestry.** Check whether a branch merged against the PR
  list, never `git rev-list main..HEAD`.
- **Verification happens before the PR opens.** The PR body says which checks
  were run.

### Code

- **No real values in tracked files.** Variables have no defaults that
  encode a real value; backends are fully partial; resource IDs in tool
  configs are placeholders.
- **Terraform:** `fmt -check` and `validate -backend=false` in CI;
  `required_version = ">= 1.10"`; provider lock files committed; outputs read
  attributes off resources, never echo variables.
- **Dependencies:** resolve versions from the registry, never from memory.
  A held-back major gets an `ignore` rule in `.github/dependabot.yml` with
  the reason and an issue for the migration.

### Issues

- **An issue is a published document.** Symptom and fix only; nothing from
  "What never appears here".
- Written for a cold reader: evidence with `file:line`, the change, and a
  closing condition stated as a command.

### Repository hygiene

- `AGENTS.md` is a symlink to `CLAUDE.md`, never a copy.
- Dependabot covers every ecosystem present, including `github-actions`.
- `main` has a ruleset: PRs only, required checks, no force-push or deletion.
- Secret scanning and push protection are on (free for public repos).
