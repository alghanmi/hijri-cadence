# Architecture

## The problem

A Hijri-yearly event (a birthday, an anniversary, an observance) has no
fixed Gregorian offset. Its Gregorian date shifts ~10–11 days earlier
every year, because the Hijri lunar year is shorter than the solar year.
`RRULE:FREQ=YEARLY` assumes a fixed offset, so a naive recurring
`VEVENT` is wrong in its first year.

## Why a live feed instead of RRULE tricks

No single recurring `VEVENT` can express this, so the Worker
**materializes individual `VEVENT`s**, one per Gregorian occurrence,
converted from the Hijri config on the fly.

Occurrences cover a rolling range of Hijri years (configured by
`occurrence_range.years_back` / `years_forward`, centered on the current
Hijri year) and are recomputed on every request. Google Calendar
re-polls subscriptions roughly every 12–24 hours, so the range only has
to comfortably outlive the polling interval.

## Pluggable calendar authority

Conversion sits behind an interface. `HijriCalendarProvider`
(see [`worker/src/providers/provider.ts`](../worker/src/providers/provider.ts))
exposes:

```typescript
interface HijriCalendarProvider {
  id: string; // e.g. "umm_al_qura"
  toGregorian(hijriYear: number, hijriMonth: number, hijriDay: number): Date;
  currentHijriYear(gregorianDate: Date): number;
}
```

v1 ships one implementation, `umm_al_qura`, backed by
[`@tabby_ai/hijri-converter`](https://www.npmjs.com/package/@tabby_ai/hijri-converter)
and covering 1343–1500 AH (~1924–2077 CE). Additional providers register
themselves at import time via `registerProvider()`. A config selects one
with its `calendar:` field, and validation rejects any id that isn't
registered.

## Config → occurrences → ICS

Three pure layers, each unit-testable in isolation:

1. **`config.ts`**: YAML → validated `Config` (zod). Rejects unknown
   `calendar` ids and duplicate events (same name, month, and day).
2. **`occurrences.ts`**: `Config` + `now` → `Occurrence[]`, sorted and
   deterministic.
   - No occurrences before an event's `hijri_year`.
   - Age = occurrence year − `hijri_year`.
   - **Month-end rule:** Hijri months have 29 or 30 days depending on
     the year. An event on day 30 is observed on day 29 in years when
     that month has 29 days. The occurrence carries a note explaining
     the shift, rendered as the event's `DESCRIPTION`.
3. **`ics.ts`**: `Occurrence[]` → RFC 5545 text.
   - CRLF line endings, 75-octet UTF-8-safe folding, TEXT escaping.
   - One `VALARM` per configured reminder.
   - An `X-HIJRI-YEAR` extension on each event.
   - UIDs: `<feed id>.<FNV-1a 64 of name+month+day>.<hijri year>@hijri-cadence`.
     They're stable across renders and distinct for every event,
     including non-ASCII names.

The Worker's HTTP handler (`feed-handler.ts`) and the local CLI
(`cli.ts`, via `make ical`) call the same three functions in the same
order. Nothing below layer 3 depends on the Worker runtime.

## Multi-tenancy

Each person or family gets a high-entropy token: base62, at least 22
characters (≥128 bits). The feed URL is `https://<host>/feed/<token>.ics`.
There's no login, OAuth, or session; the token IS the capability, so
losing it is the threat model to plan for.

- Malformed tokens get the same 404 as unknown ones.
- Responses are `cache-control: private` (personal data behind a
  capability URL).
- Tokens are always SHA-256-hashed before they reach logs (`hashToken()`
  in `feed-handler.ts`).

## Config bundling: build-time `--define`

Real configs never live in this repo. The deploy companion holds one
YAML file per person or family (the event config plus a `token:` field)
and bundles them into the Worker at deploy time:

1. `bundle-configs --dir <people dir> --out configs.json`
   (`worker/src/bundle-cli.ts`, also `make bundle-configs`):
   - validates every file against the same zod schema the Worker uses,
     plus the token rules
   - rejects duplicate tokens and an empty set
   - emits `{ "<token>": { calendar, occurrence_range, events }, … }`
   - diagnostics name the file and field path, never values
2. wrangler bakes the JSON in as a JS string literal:
   `--define CONFIGS_JSON:"$(jq -Rs . < configs.json)"`.
   `jq -Rs .` produces a properly escaped string literal
   (`{"a":"b"}` → `"{\"a\":\"b\"}"`). A naive
   `--define CONFIGS_JSON:'"<raw-json>"'` would break, because the JSON's
   inner quotes collide with the outer ones.
3. At cold start `feed-handler.ts` runs `JSON.parse` once and looks up
   the token on each request. Each entry is validated again on use.

`VERSION` uses the same substitution; see
[`worker/src/globals.d.ts`](../worker/src/globals.d.ts). CI dry-run-builds
a bundle through this exact path (`pr-checks.yml`).

Trade-offs:

- **No runtime state.** No D1, KV, or Durable Objects; the Worker is a
  pure function of its bundle.
- **Config edits require a redeploy.** In the companion, merging a config
  change redeploys the currently released version of this repo. Code
  changes deploy when a release is cut here. A UI-driven config flow is
  v2 backlog.

## Scale limits

Build-time bundling puts a hard ceiling on the number of configs one
Worker instance can serve. Cloudflare's current Worker script size
limits:

- **Free plan:** 3 MiB compressed
- **Paid plan:** 10 MiB compressed

At ~5 KB per family YAML (a dozen events, reasonable name lengths),
that's roughly:

- ~600 families on the free plan
- ~2000 families on the paid plan

That's orders of magnitude beyond personal, family, or small-community
scale. Going further would mean moving `CONFIGS_JSON` out of the bundle
(KV or D1), which would also decouple config updates from code deploys.
That's a v2+ concern.

## A note on timezones

VEVENTs are emitted as `VALUE=DATE` (all-day events), which per RFC 5545
"float" in the calendar client's local timezone. That's the correct
semantic for the primary use cases, birthdays and anniversaries: a
person's Hijri birthday in a given Gregorian year is the same calendar
day everywhere on Earth, and the client should show it as a local day.

Floating dates would mislead for observances tied to a specific
timezone (e.g. a sighting-anchored Ramadan start), but the non-goals
already rule out sighting-based calculation. Umm al-Qura is a tabular
authority appropriate for scheduling, not for determining religious
observance start times.

## Observability

**A. Silent wrong dates (correctness).** Two tiers run the same golden
vectors:

- Tier 1: unit tests in `worker/test/conversion.test.ts`, gated on every
  PR.
- Tier 2: `runSelfCheck()` in `worker/src/healthcheck.ts`, fired by the
  Worker's cron trigger in production. It catches drift between the CI
  runtime and production `workerd`.

Tier 3 (`worker/test/spot-check/aladhan.spotcheck.ts`, `make spot-check`)
cross-checks against the Aladhan API's Umm al-Qura calculation as an
independent authority. It is explicitly **not** part of CI (no live
network calls), but it's easy to run on demand.

**B. Silent downtime (availability)**, partially covered:

- Each cron run ends with a Healthchecks.io ping, or the `/fail` variant
  when the self-check mismatches or throws. This proves the Worker runs
  on schedule. It does **not** prove the public hostname serves feeds:
  a DNS, certificate, or routing problem wouldn't trip it.
- The deploy pipeline smoke-tests the live hostname after every deploy
  (a known token returns a calendar; an unknown one returns 404).
- Structured JSON logs on every request via `logger.ts`, with required
  fields `ts`, `level`, `event`, `version`, `instance`. The token is
  hashed; the raw token is never logged.

## Split-repo pattern

The public source repo (this one) holds the engine: Worker code, tests,
the Terraform _module_, docs, and release-please. It holds exactly **one
secret**: `DEPLOY_DISPATCH_TOKEN`, a fine-scoped PAT that can only fire
the `repository_dispatch` event. A leaked token lets an attacker
redeploy an already-released version, nothing more.

The private deploy companion holds:

- per-family configs (committed there)
- non-secret operational values (hostname, account/zone IDs, cron
  schedule, the Healthchecks ping URL)
- the Terraform environment and state backend config
- credential-sync scripts
- the workflow that runs the deploy

Its only secrets are the Cloudflare API token and the R2 state-bucket
keys.

Ownership inside a deploy:

- **Terraform** owns the Worker entity through the code-less
  `cloudflare_worker` resource (observability settings, workers.dev off),
  plus the custom domain and the cron trigger. It never reads or uploads
  code. `wrangler.toml` deliberately has no `[triggers]` or
  `[observability]`, because wrangler would overwrite those settings on
  every deploy.
- **wrangler** owns the code bundle, the compatibility date/flags, and the
  plain-text vars (`INSTANCE_ID`, `LOG_LEVEL`, `HEARTBEAT_URL`), which the
  deploy passes as `--var`. It deploys to the Terraform-managed Worker via
  `--name`.

Deploy chains:

```
this repo                                deploy companion
─────────                                ────────────────
commit → main
release-please.yml opens release PR
merge release PR
  ├── release-please creates tag + release
  └── dispatch repository_dispatch  →  deploy workflow
                                          ├── bundle-configs (validate)
                                          ├── terraform apply
                                          ├── wrangler deploy --name <script>
                                          │     (CONFIGS_JSON + VERSION baked in)
                                          └── smoke test the live hostname

                                        merge a config change
                                          └── same workflow, at the latest
                                              released tag of this repo
```

`GITHUB_TOKEN` doesn't fire downstream workflows (GitHub's anti-recursion
safeguard), so the dispatch is chained _inside_ `release-please.yml`
rather than via `on: release: [published]`. `notify-deploy.yml` is a
manual `workflow_dispatch` escape hatch for re-dispatching an existing
tag.
