# Design Doc: hijri-cadence

**Status:** Draft v4 for review
**Name:** `hijri-cadence` — confirmed
**Target:** MIT-licensed, open source — hosted on **forklabs.cc** (subdomain: `cadence.forklabs.cc`)

> Note on examples: all names, dates, and tokens in this document are
> fictitious. Real event data (names, birthdays, years) lives only in the
> private deploy repo (§10), never in the public code repo, README, or any
> code example.

---

## 1. Problem

Google Calendar (and most mainstream calendar apps) has no native concept of
Hijri-date recurrence. A Hijri birthday or anniversary shifts ~10–11 days
earlier on the Gregorian calendar every year, so a plain yearly `RRULE` is
wrong the moment it's created. Today the options are: convert manually every
year, or hand your family's dates to a third-party SaaS.

**Input:** a static, human-edited list of named events, each with a Hijri day,
month, and optional year. Example (fictitious):

```
("Layla's Hijri Birthday", 7, 10, 1406)
```

**Output:** an always-current calendar feed. If a year is provided, each
generated occurrence's title includes the Hijri age for that occurrence, e.g.
`Layla's Hijri Birthday (41)`.

## 2. Market survey (why build this)

No existing tool does this combination. Summary of what's out there:

| Tool                                                                   | Gap                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| HijriMinder                                                            | Paid SaaS, OAuth into your Google/Microsoft account, birthdays only, not self-hostable, no arbitrary event list |
| billylo1/lunar-birthday-calendar-web, AnyTools Recurring Event Creator | Chinese lunar calendar, not Hijri; single-birthday tools, not a config-driven event list                        |
| Various Hijri "birthday calculators"                                   | One-shot date converters, no ICS/feed output at all                                                             |

Nothing lets you commit a small config file of arbitrary named events and get
a subscribable, self-hosted feed. That's the gap this fills.

## 3. Decisions

- **Architecture:** Cloudflare Worker serving a live `webcal://` subscription
  URL, not a static one-off script.
- **Calculation authority:** pluggable, defaulting to Umm al-Qura (§6, §7).
- **Config storage:** static YAML file(s), redeployed to update — no database.
- **Multi-tenant privacy:** unguessable secret token per user/family in the
  URL path.
- **Distribution:** open source, MIT, hosted at **forklabs.cc**.
- **Repo split:** public code repo + private deploy repo, mirroring FluxTube
  (confirmed against the real, public `fluxtube` repo — see §10).
- **Observability:** correctness (wrong dates) and availability (feed down)
  both need proactive alerting, not "discovered by missing an event."

## 4. Non-goals

- Moon-sighting-based dates. Umm al-Qura (and any future calendar option) is
  a fixed, published, tabular calendar — appropriate for scheduling,
  explicitly _not_ appropriate for determining Ramadan/Eid start dates, which
  depend on sighting. This gets a one-line disclaimer in the README.
- Write access / two-way sync. Read-only feed, like any public ICS
  subscription.
- A UI for populating dates. Config is a file in the repo in v1 — tracked as
  a GitHub Issue for v2 (§15).
- Dates outside 1343–1500 AH (1924–2077 CE), which is the practical bound of
  every available conversion library and of Umm al-Qura's own published data.

## 5. Why a live feed instead of RRULE tricks

`RRULE:FREQ=YEARLY` assumes a fixed offset from a Gregorian anchor date. A
Hijri-yearly event does not have one — the Gregorian date moves by ~11 days a
year. So the Worker can't emit one clever recurring `VEVENT`; it must
**materialize individual `VEVENT`s**, one per Gregorian occurrence, converted
from the Hijri config on the fly.

The Worker generates occurrences for a **rolling range** (§7 defines the
default and how it's configured), recomputed from config on every request.
Google Calendar re-polls subscribed `webcal://` feeds roughly every 12–24
hours, so the range just needs to comfortably outlive that polling interval —
no need to pre-generate or cache beyond a short edge-cache TTL.

## 6. Calendar authority: pluggable, Umm al-Qura by default

Rather than hardcoding Umm al-Qura, the conversion layer is an interface:

```typescript
interface HijriCalendarProvider {
  id: string; // e.g. "umm_al_qura"
  toGregorian(hijriYear: number, hijriMonth: number, hijriDay: number): Date;
  currentHijriYear(gregorianDate: Date): number;
}
```

- **Default / v1 implementation:** `umm_al_qura`, backed by
  **`@tabby_ai/hijri-converter`** — TypeScript-first, zero runtime
  dependencies (clean fit for the Workers runtime), Umm al-Qura based, ported
  from the reference Python `hijri-converter` implementation. Covers
  1343–1500 AH.
- **Extensibility:** additional providers (e.g. a tabular/arithmetic civil
  calendar, or a different regional authority) register under their own
  `id` and are selected per §7's config field. No provider beyond
  `umm_al_qura` ships in v1.
- Runner-up library if `umm_al_qura` needs a fallback implementation:
  `moment-hijri` (91.8% self-reported accuracy, pulls in `moment`) — kept as
  a documented alternative, not wired in by default.

## 7. Config schema

Renamed `window` → **`occurrence_range`** — more descriptive of what it
actually controls (the span of Gregorian occurrences the feed materializes),
and doesn't collide with "window" as used elsewhere for polling/cache
windows.

```yaml
# events.yaml (private deploy repo — fictitious example below)
calendar: umm_al_qura # required; selects the HijriCalendarProvider

occurrence_range:
  years_back: 3 # default
  years_forward: 6 # default

events:
  - name: "Layla's Hijri Birthday"
    hijri_day: 7
    hijri_month: 10 # Shawwal
    hijri_year: 1406 # optional — enables the age suffix
    reminder_days_before: [1, 7]

  - name: 'Family Anniversary'
    hijri_day: 5
    hijri_month: 12
    reminder_days_before: [] # no reminders
    # no hijri_year → title never shows an age suffix
```

Age-suffix rule (unchanged): for a _given generated occurrence_, age = that
occurrence's Hijri year minus `hijri_year`, computed per-occurrence.

A matching fictitious file ships as `examples/events.example.yaml` (§12) —
usable as-is for local testing, `make ical-local`, and as the fixture behind
the ICS-generation unit tests (§13).

## 8. Multi-tenant model

- Each user/family gets a token → their own event file mapping.
- Feed URL: `https://cadence.forklabs.cc/feed/<token>.ics`
- Token is high-entropy (128-bit, base62-encoded), generated once, not tied
  to any PII.
- No login, no OAuth.

## 9. Where tokens/config live — recommendation

Given the repo split in §10, the answer falls out naturally:

- The **public code repo** contains zero real data — just the generic
  Worker engine, the `HijriCalendarProvider` interface, the default
  `umm_al_qura` provider, tests, and the fictitious `examples/` config.
- The **private deploy repo** contains one YAML file per person/family
  (e.g. `config/layla.yaml`, `config/family-anniversaries.yaml`), each with
  its own `calendar`, `occurrence_range`, `events`, and a `token:` field.
- A `token:` field inside each person's file (rather than a separate mapping
  file) — one file per person, nothing extra to keep in sync.
- At build/deploy time, the private repo's config is bundled into the Worker
  (consistent with the "static file, redeploy to update" decision — no KV
  needed for v1). This keeps real names, birthdays, and tokens entirely out
  of the public repo's git history, forever, by construction — not by
  discipline.

## 10. Repo structure — verified against the real FluxTube repos

I read the actual public `fluxtube` repo (`CLAUDE.md`, `docs/setup.md`,
full tree) to ground this rather than approximate it. `fluxtube-deploy` and
`forklabs-cc` are private and I couldn't read them directly — the deploy-repo
shape below is reconstructed from what FluxTube's own public `CLAUDE.md`
documents about its deploy companion, which is thorough enough to work from.
If you can make `fluxtube-deploy` or `forklabs-cc` readable to me, I'll
true this section up exactly.

**FluxTube's actual pattern** (confirmed):

- Public repo holds: Worker/dashboard source, tests, Terraform _module_
  (not the environment), docs, release-please, GitHub Actions for
  typecheck/lint/test/audit + `terraform fmt/validate` + release-please +
  a `notify-deploy.yml` that fires a `repository_dispatch` to the deploy repo
  on `release: published`.
- Public repo's `wrangler.toml` ships with **placeholder** resource IDs
  (`00000000-…` D1 UUID, `fluxtube-placeholder-*` R2 bucket) — Terraform
  sets the real bindings; nothing real is ever committed to the public repo.
- Public repo holds exactly **one secret**: a fine-scoped PAT
  (`DEPLOY_DISPATCH_TOKEN`) that can only fire the dispatch — compromising it
  lets someone redeploy already-released code, nothing more.
- Private deploy repo holds: real Cloudflare account ID, Worker secrets,
  `deploy-on-release.yml` (consumes the dispatch, runs `terraform apply` +
  `wrangler deploy`), a `terraform-apply.yml` manual dispatch entrypoint, ops
  scripts that talk to the password manager, and an operator runbook
  (`TODO.md`, `docs/bootstrap.md`, etc).
- Versioning via **release-please** reading Conventional Commits — the
  release, not the merge to `main`, is what triggers deployment.

**Applying that pattern here:**

**`hijri-cadence`** (public, MIT) — the engine:

```
.
├── README.md, CLAUDE.md, AGENTS.md, SECURITY.md, LICENSE (MIT)
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
├── tsconfig.base.json, eslint.config.js, .prettierrc
├── release-please-config.json, .release-please-manifest.json, CHANGELOG.md
├── .github/workflows/
│   ├── pr-checks.yml          # typecheck + lint + test + audit
│   ├── terraform-check.yml    # fmt -check + validate
│   ├── release-please.yml     # push to main → release PR
│   └── notify-deploy.yml      # release published → dispatch to deploy repo
├── docs/
│   ├── architecture.md, setup.md
├── examples/
│   └── events.example.yaml    # fictitious, see §12
├── infrastructure/terraform/
│   └── _modules/hijri-cadence-environment/   # module only, no state
│       ├── worker.tf, dns.tf (or route.tf), variables.tf, outputs.tf, locals.tf
└── worker/
    ├── package.json, wrangler.toml   # PLACEHOLDER ids only
    ├── src/
    │   ├── index.ts                  # scheduled + fetch handlers
    │   ├── providers/
    │   │   ├── provider.ts           # HijriCalendarProvider interface
    │   │   └── umm-al-qura.ts        # default implementation
    │   ├── occurrences.ts            # config → occurrence list (pure)
    │   ├── ics.ts                    # occurrence list → ICS text (pure)
    │   ├── config.ts                 # YAML parse/validate (zod)
    │   ├── feed-handler.ts           # /feed/<token>.ics
    │   ├── healthcheck.ts            # golden-vector self-check + Healthchecks.io ping
    │   └── cli.ts                    # local ICS generation entry point (§12)
    └── test/
        ├── conversion.test.ts        # golden-vector unit tests (§13)
        ├── occurrences.test.ts
        ├── ics.test.ts
        └── spot-check/
            └── aladhan.spotcheck.ts  # third-party validation, NOT run in CI (§13)
```

**`hijri-cadence-deploy`** (private) — your instance:

```
.
├── config/
│   ├── deploy.env                    # non-secret vars (route, account id)
│   └── people/
│       ├── layla.yaml                # real event data + token
│       └── ...
├── infrastructure/terraform/environments/production/
│   ├── main.tf, variables.tf, terraform.tfvars, backend.hcl
├── .github/workflows/
│   ├── deploy-on-release.yml         # consumes repository_dispatch
│   └── terraform-apply.yml           # manual workflow_dispatch
├── scripts/
│   ├── sync-github-secrets.sh        # Bitwarden → GitHub Secrets/Variables
│   ├── sync-worker-secrets.sh        # Bitwarden → wrangler secret put
│   └── bootstrap-local-tf.sh
├── Makefile                          # §12
└── TODO.md, docs/bootstrap.md        # operator runbook
```

## 11. Local ICS generation (v1 requirement)

`worker/src/occurrences.ts` and `worker/src/ics.ts` are pure functions with
no Worker-runtime dependency, shared by:

1. The Worker's HTTP feed handler (`worker/src/feed-handler.ts`)
2. `worker/src/cli.ts` — a local CLI entry point that reads a config file and
   writes an `.ics` file to disk, no deployment or network required

Exposed via `pnpm --filter worker generate:local -- --config <path> --out
<path>`, and via the Makefile's `ical-local` target (§12) for anyone who
doesn't want to remember the pnpm invocation.

## 12. Examples directory + Makefile

**`examples/events.example.yaml`** ships in the public repo, entirely
fictitious, and is the fixture used by both the ICS-generation unit tests
and `make ical-local`:

```yaml
calendar: umm_al_qura

occurrence_range:
  years_back: 3
  years_forward: 6

events:
  - name: "Layla's Hijri Birthday"
    hijri_day: 7
    hijri_month: 10
    hijri_year: 1406
    reminder_days_before: [1, 7]

  - name: 'Family Anniversary'
    hijri_day: 5
    hijri_month: 12
    reminder_days_before: []
```

**Makefile** — for the private deploy repo, following the
`infra-core-domains` philosophy of "every local operation goes through
`make`, nothing memorized." As noted above, I don't have the actual file, so
this is a best-effort target list, not a mirror:

```makefile
.PHONY: help setup secrets deploy dev test lint ical-local spot-check clean destroy

help:            ## List available targets
setup:           ## Install deps (pnpm install), verify tool versions
secrets:         ## Pull secrets/vars from Bitwarden → GitHub Secrets/Variables + wrangler
dev:             ## Run the Worker locally (wrangler dev) against local config
deploy:          ## terraform apply + wrangler deploy — requires CONFIRM=1
test:            ## Unit tests + golden-vector conversion checks + lint
lint:            ## eslint + prettier --check + terraform fmt -check
ical-local:      ## Generate a local .ics — CONFIG=examples/events.example.yaml OUT=out.ics
spot-check:      ## Cross-check golden vectors against the Aladhan API (network; not CI-gated, §13)
clean:           ## Remove build artifacts, local .ics output, caches
destroy:         ## Tear down deployed Worker + DNS — requires CONFIRM=1
```

`secrets` follows the confirmed Bitwarden pattern from FluxTube: Hidden
fields (API tokens, Healthchecks.io ping URL) → `wrangler secret put` /
GitHub Secrets; Text fields (non-sensitive config) → GitHub Variables /
`wrangler.toml` vars, via `sync-github-secrets.sh` / `sync-worker-secrets.sh`
naming (matching FluxTube's confirmed script names).

**Please share the real `infra-core-domains` Makefile** if you want target
names, ordering, `.PHONY` conventions, and help-text formatting matched
exactly instead of approximated.

## 13. Testing: unit tests, golden spot checks, and third-party validation

Three tiers, deliberately separated by network dependency:

**Tier 1 — unit tests (`worker/test/*.test.ts`, CI-gated, no network)**

- `conversion.test.ts`: a golden-vector table of known Hijri↔Gregorian pairs
  drawn from published Umm al-Qura reference data (no personal dates),
  checked against `umm-al-qura.ts` on every commit via `pnpm test`.
- `occurrences.test.ts`: given `examples/events.example.yaml`, asserts the
  right count of occurrences for the configured `occurrence_range`, and that
  the age suffix is computed per-occurrence correctly.
- `ics.test.ts`: asserts generated `VEVENT`/`VALARM` structure — one
  `VALARM` per entry in `reminder_days_before`, correct `SUMMARY` including
  the age suffix, RFC 5545-valid output.
- Same convention as FluxTube: Vitest, `@cloudflare/vitest-pool-workers`, no
  live network calls in this tier.

**Tier 2 — runtime self-check (deployed Worker, no external network)**

- The Cron Trigger from §14 runs the same golden-vector check _inside_ the
  deployed Worker (catches `workerd`-vs-CI runtime drift), independent of
  Tier 1.

**Tier 3 — third-party spot check (`worker/test/spot-check/aladhan.spotcheck.ts`, manual/scheduled, network)**

- The [Aladhan API](https://aladhan.com) exposes free, unauthenticated
  Hijri↔Gregorian conversion endpoints (`/v1/gToH/{dd-mm-yyyy}`, `/v1/hToG/{dd-mm-yyyy}`),
  and its underlying `islamic-network/calendar` library explicitly supports
  an Umm al-Qura calculation method (`calendarMethod=UAQ`) — the same
  authority this project defaults to, so it's a meaningful independent
  cross-check rather than a different calendar system entirely.
- The script takes the same golden-vector table from Tier 1, calls Aladhan
  for each date, and diffs the result against the local
  `@tabby_ai/hijri-converter` output. Mismatches are reported, not silently
  ignored.
- **Deliberately not part of `pnpm test` / `pr-checks.yml`** — it depends on
  an external service being up, matching FluxTube's stated convention of "no
  live network calls in CI." Instead it's a `make spot-check` target, runnable
  on demand, and a candidate for a low-frequency (e.g. weekly)
  `workflow_dispatch`/scheduled Action in the deploy repo — informational,
  not PR-blocking.

## 14. Observability & alerting

Two distinct failure modes, both addressed:

**A. Silent wrong-dates (correctness) failure**

- Tier 1 + Tier 2 testing from §13.

**B. Silent availability failure**

- Cron Trigger pings a Healthchecks.io check-in URL after the self-check
  passes — same pattern as your other cron monitoring.
- Structured JSON logging on every feed request (matching FluxTube's
  convention: one JSON line per significant event, required fields `ts`,
  `level`, `event`, `version`, hashed token instead of `instance_id`).
- Optional `/health` endpoint for manual checks or an independent uptime
  probe.

## 15. v2+ backlog — tracked via GitHub Issues, not this doc

Filed on the public repo at project start, not designed further here:

- **UI for populating dates** — a small form/editor so events don't require
  hand-editing YAML.
- **Passkey auth** — WebAuthn-based auth for that UI (not the feed URL
  itself — calendar clients can't do a passkey challenge mid-poll), same
  general shape as FluxTube's dashboard using `@simplewebauthn/server`.

Neither blocks v1.

## 16. Rollout TODOs

- [ ] DNS: `cadence.forklabs.cc` pointed at the Worker
- [ ] Domain/route config: Cloudflare Worker route + Terraform, alongside
      the rest of the forklabs.cc domain setup
- [ ] Landing webpage on forklabs.cc: what the tool is, the moon-sighting
      disclaimer, link to the public repo, self-hosting instructions
- [ ] Public repo README + `examples/events.example.yaml`
- [ ] Private deploy repo scaffolded with real config

## 17. Suggested next step

With §7–§14 settled, this is scaffoldable in Claude Code in one or two
passes: public engine repo first (provider interface, Umm al-Qura provider,
feed handler, local CLI, three-tier tests, CI), then the private deploy repo
(Makefile, Terraform/DNS, real config, Healthchecks.io wiring) — same shape
as the FluxTube scaffolding prompt already in use.
