# Architecture

## The problem

A Hijri-yearly event (a birthday, an anniversary, an observance) does not
have a fixed Gregorian offset — the Gregorian date shifts ~10–11 days
earlier every year as the Hijri lunar year runs shorter than the solar
one. `RRULE:FREQ=YEARLY` assumes exactly that fixed offset, so a naive
recurring `VEVENT` is wrong on year one.

## Why a live feed instead of RRULE tricks

The Worker can't emit one clever recurring `VEVENT`. It must
**materialize individual `VEVENT`s**, one per Gregorian occurrence,
converted from the Hijri config on the fly.

Occurrences are generated for a rolling range — configured by
`occurrence_range.years_back` / `years_forward` — recomputed from config
on every request. Google Calendar re-polls subscribed `webcal://` feeds
roughly every 12–24 hours, so the range just needs to comfortably outlive
the polling interval.

## Pluggable calendar authority

Conversion is behind an interface, not hardcoded. `HijriCalendarProvider`
(see [`worker/src/providers/provider.ts`](../worker/src/providers/provider.ts))
exposes:

```typescript
interface HijriCalendarProvider {
  id: string; // e.g. "umm_al_qura"
  toGregorian(hijriYear: number, hijriMonth: number, hijriDay: number): Date;
  currentHijriYear(gregorianDate: Date): number;
}
```

v1 ships one implementation: `umm_al_qura`, backed by
[`@tabby_ai/hijri-converter`](https://www.npmjs.com/package/@tabby_ai/hijri-converter),
covering 1343–1500 AH (~1924–2077 CE). Additional providers register
themselves at import time via `registerProvider()` and are selected
per-config by the `calendar:` field.

## Config → occurrences → ICS

Three pure layers, each unit-testable in isolation:

1. **`config.ts`** — YAML → validated `Config` object (via `zod`).
2. **`occurrences.ts`** — `Config` + `now` → `Occurrence[]` (sorted,
   dedupe-safe, deterministic).
3. **`ics.ts`** — `Occurrence[]` → RFC 5545 ICS text (CRLF, line
   folding, one `VALARM` per configured reminder, `X-HIJRI-YEAR`
   extension for round-tripping).

Both the Worker's HTTP handler (`feed-handler.ts`) and the local CLI
(`cli.ts`) call the same three functions in the same order — no
Worker-runtime dependency below layer 3.

## Multi-tenancy

Each user or family gets a high-entropy token (128-bit, base62). The
feed URL is `https://<host>/feed/<token>.ics`. There's no login, no
OAuth, no session — the token IS the capability. Losing it is the
threat model to plan for.

Tokens are always SHA-256-hashed before landing in logs. See
`feed-handler.ts` → `hashToken()`.

## Config bundling — build-time `--define`

Config for every user lives in the private companion repo
(`hijri-cadence-deploy/config/people/*.yaml`) — never in this repo.

At deploy time, the deploy workflow:

1. Reads every `config/people/*.yaml` file
2. Parses each and validates it against the same zod schema this Worker
   uses at runtime
3. Emits a JSON object keyed by token:
   `{ "<token1>": { ...config1 }, "<token2>": { ...config2 } }`
4. Passes it to wrangler as a JS string literal:
   `--define CONFIGS_JSON:"$(printf '%s' "$CONFIGS_JSON" | jq -Rs .)"`.
   The `jq -Rs .` wraps the raw JSON in a properly-escaped string literal
   (e.g. `{"foo":"bar"}` → `"{\"foo\":\"bar\"}"`) so the substituted
   identifier compiles to valid JavaScript. A naive
   `--define CONFIGS_JSON:'"<raw-json>"'` would break — the raw JSON's
   inner `"` collide with the outer quotes.

Wrangler substitutes the identifier `CONFIGS_JSON` in the bundle at
build time. At request time, `feed-handler.ts` `JSON.parse`s the string
once (cold start), then looks up by token on each hit.

Trade-offs:

- **No runtime state.** No D1, no KV, no Durable Objects. The Worker is
  a pure function of its bundle.
- **Config edits require a redeploy.** By design — v1's stated
  operator flow is "edit YAML → commit → release-please cuts a release
  → auto-deploy." A UI-driven config flow lands in v2 (see the v2
  backlog in the design doc).
- Same substitution trick is used for `VERSION` — see
  [`worker/src/globals.d.ts`](../worker/src/globals.d.ts).

## Scale limits

The build-time-bundling design puts a hard ceiling on the number of
per-family configs a single Worker instance can serve. Cloudflare's
current Worker script size limits (post-2024 increases):

- **Free plan:** 3 MiB compressed
- **Paid plan:** 10 MiB compressed

At ~5 KB per family YAML (a dozen events, reasonable name lengths),
that's roughly:

- ~600 families on the free plan
- ~2000 families on the paid plan

Adequate by orders of magnitude for personal / family / small-community
scale. A scale beyond that would require moving CONFIGS_JSON out of the
bundle — the obvious next step is KV or D1, which decouples config
updates from code deploys entirely. That is a v2+ concern; the design
doc's non-goals section explicitly rejects it for v1.

## A note on timezones

VEVENTs are emitted as `VALUE=DATE` (all-day events), which per RFC 5545
"float" in the calendar client's local timezone. This is the correct
semantic for the primary use cases — birthdays and anniversaries — since
a person's Hijri birthday in a given Gregorian year is the same calendar
day everywhere on Earth, and the client should display it as their local
day.

For religious observances that ARE tied to a specific timezone (e.g. a
sighting-anchored Ramadan start), floating dates would be misleading —
but the design's non-goals section already rejects sighting-based date
calculation. The Umm al-Qura calendar this Worker uses is a tabular
authority appropriate for scheduling, not for determining religious
observance start times.

## Observability

Two distinct failure modes, both addressed:

**A. Silent wrong-dates (correctness).** Two tiers of the same golden
vectors:

- Tier 1: unit tests in `worker/test/conversion.test.ts`, gated on every
  PR.
- Tier 2: `runSelfCheck()` in `worker/src/healthcheck.ts`, fired from
  the Cron Trigger inside the deployed Worker. Catches drift between
  the CI runtime and `workerd` in production.

Tier 3 (`worker/test/spot-check/aladhan.spotcheck.ts`) cross-checks
against the Aladhan API's Umm al-Qura calculation as an independent
authority — explicitly **not** part of CI (no live network calls) but
easy to run on demand.

**B. Silent availability (feed down).** Every scheduled invocation ends
with a Healthchecks.io ping (or `/fail` variant on self-check mismatch).
Structured JSON logging on every request via `logger.ts` — required
fields `ts`, `level`, `event`, `version`, `instance`. Token is hashed;
raw token never logged.

## Split-repo pattern

The public source repo (`alghanmi/hijri-cadence` — this repo) contains
the engine: Worker code, tests, Terraform _module_, docs, release-please.
It holds exactly **one secret**: `DEPLOY_DISPATCH_TOKEN`, a
fine-scoped PAT that can fire the `repository_dispatch` event.
Compromising it lets an attacker redeploy an already-released version —
nothing more.

The private companion repo (`alghanmi/hijri-cadence-deploy`) holds
per-family configs (`config/people/*.yaml`), non-secret operational
values (`config/deploy.env`), Terraform environment
(`infrastructure/terraform/environments/production/`), Bitwarden-aware
ops scripts, and the workflow that consumes the dispatch and runs the
deploy pipeline.

Release chain:

```
this repo                                deploy repo
─────────                                ───────────
commit → main
release-please.yml opens release PR
merge release PR
  ├── release-please creates tag + release
  └── dispatch repository_dispatch  →  deploy-on-release.yml
                                          ├── terraform apply
                                          └── wrangler deploy
                                              (with real CONFIGS_JSON
                                               + VERSION baked in)
```

`GITHUB_TOKEN` doesn't fire downstream workflows (GitHub anti-recursion
safeguard), so the dispatch is chained _inside_ `release-please.yml`
rather than via `on: release: [published]`. `notify-deploy.yml` stays
around as a manual `workflow_dispatch` escape hatch.
