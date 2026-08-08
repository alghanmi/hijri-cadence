# hijri-cadence

Serverless Hijri-calendar event feed. Point your calendar app at a
`webcal://` URL, get always-current Gregorian occurrences of your
Hijri-dated events (birthdays, anniversaries, family observances).

## Why

Google Calendar and most mainstream calendar apps have no native concept
of Hijri-date recurrence. A Hijri-yearly event shifts ~10–11 days earlier
on the Gregorian calendar every year, so a plain yearly `RRULE` is wrong
the moment it's created.

This is a small Cloudflare Worker that reads a static YAML config of
events and materializes an always-current ICS feed for a rolling window
of years.

## What you get

- Live `webcal://cadence.example.com/feed/<token>.ics` subscription
- Umm al-Qura Hijri↔Gregorian conversion by default; pluggable calendar
  authority (`HijriCalendarProvider` interface)
- Configurable per-event reminders → one `VALARM` per entry
- Optional per-event Hijri year → age suffix in the event title
- Local CLI (`pnpm generate:local`) to render an `.ics` file to disk
  without deploying anything
- Golden-vector unit tests + Aladhan-API spot-check (network,
  out-of-CI)

## Non-goals

- Moon-sighting-based dates. Umm al-Qura is a fixed tabular calendar
  suitable for scheduling but **explicitly not** appropriate for
  determining Ramadan / Eid start dates, which depend on sighting.
- Write access / two-way calendar sync. Read-only feed, like any
  public ICS subscription.
- Dates outside 1343–1500 AH (1924–2077 CE).

## Self-hosting

See [`docs/setup.md`](docs/setup.md) for the local-dev quick start and
[`docs/architecture.md`](docs/architecture.md) for how the pieces fit
together.

The hosted deployment at `cadence.forklabs.cc` is one instance of this
Worker. Its per-family config, tokens, and Cloudflare credentials live in
a separate private companion repo (`hijri-cadence-deploy`) — see
[the split-repo pattern](docs/architecture.md#split-repo-pattern) if
you want to run the same shape yourself.

## Repo layout

```
hijri-cadence/
├── worker/                              # Cloudflare Worker
│   ├── src/
│   │   ├── providers/                   # HijriCalendarProvider interface + Umm al-Qura
│   │   ├── occurrences.ts               # config → occurrence list (pure)
│   │   ├── ics.ts                       # occurrence list → ICS text (pure, RFC 5545)
│   │   ├── config.ts                    # YAML parse + zod validation
│   │   ├── feed-handler.ts              # GET /feed/<token>.ics
│   │   ├── healthcheck.ts               # Cron self-check + Healthchecks.io ping
│   │   ├── cli.ts                       # `pnpm generate:local` entry point
│   │   └── index.ts
│   └── test/
│       ├── conversion.test.ts           # golden-vector unit tests (Tier 1)
│       ├── occurrences.test.ts
│       ├── ics.test.ts
│       └── spot-check/aladhan.spotcheck.ts   # Tier 3 (network, not CI)
├── infrastructure/terraform/
│   └── _modules/hijri-cadence-environment/   # reusable Terraform module
├── examples/events.example.yaml         # fictitious sample config
└── docs/
```

## License

MIT — see [`LICENSE`](LICENSE).
