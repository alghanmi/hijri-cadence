# hijri-cadence

Serverless Hijri-calendar event feed. Point your calendar app at a
`webcal://` URL and get always-current Gregorian dates for your
Hijri-dated events: birthdays, anniversaries, family observances.

## Why

Google Calendar and most other mainstream calendar apps have no native concept
of Hijri-date recurrence. A Hijri-yearly event shifts ~10–11 days earlier
on the Gregorian calendar every year, so a plain yearly `RRULE` is wrong
the moment it's created.

This is a small Cloudflare Worker. It reads a static YAML config of events
and serves an always-current ICS feed covering a rolling window of years.

## What you get

- A live subscription URL: `https://<your-host>/feed/<token>.ics`
- Umm al-Qura Hijri↔Gregorian conversion by default, with a pluggable
  calendar authority (the `HijriCalendarProvider` interface)
- Per-event reminders: one `VALARM` per entry in `reminder_days_before`
- An optional per-event Hijri year, which adds an age suffix to the event title
- Month-end dates handled: an event on the 30th is observed on the 29th in
  years when that month has only 29 days, and the event description
  explains why
- A local CLI (`make ical`) that renders an `.ics` file to disk without
  deploying anything
- Golden-vector unit tests, plus an Aladhan-API spot-check (network,
  out of CI)

## Subscribing

Each feed URL contains a secret token; anyone with the URL can read the
feed, so share it like a password.

- **Apple Calendar:** File → New Calendar Subscription → paste
  `webcal://<host>/feed/<token>.ics`. Reminders (`VALARM`) are honored
  unless you tick "Remove alerts".
- **Google Calendar:** Other calendars → + → From URL → paste
  `https://<host>/feed/<token>.ics`. Google refreshes subscriptions on
  its own schedule (often 12–24 h) and **ignores reminders** in
  subscribed feeds; set notifications on the calendar itself instead.
- **Outlook:** Add calendar → Subscribe from web.

## Non-goals

- Moon-sighting-based dates. Umm al-Qura is a fixed tabular calendar
  suitable for scheduling but **explicitly not** appropriate for
  determining Ramadan / Eid start dates, which depend on sighting.
- Write access / two-way calendar sync. It's a read-only feed, like any
  public ICS subscription.
- Dates outside 1343–1500 AH (1924–2077 CE).

## Development

Every local operation has a `make` target (`make help` lists them):

```sh
make install     # pnpm install --frozen-lockfile
make check       # typecheck + lint + format check + Tier 1 tests
make ical CONFIG=examples/events.example.yaml OUT=/tmp/events.ics
make spot-check  # cross-check golden dates against the Aladhan API (network)
```

See [`docs/setup.md`](docs/setup.md) for the full local-dev guide and
[`docs/architecture.md`](docs/architecture.md) for how the pieces fit
together.

## Self-hosting

The hosted deployment at `hijri-cadence.alghanmi.cloud` is one instance of
this Worker. Its per-family configs, tokens, and Cloudflare credentials
live in a separate private deploy companion repo. See
[the split-repo pattern](docs/architecture.md#split-repo-pattern) to run
the same shape yourself.

## Repo layout

```
hijri-cadence/
├── Makefile                             # every local operation
├── worker/                              # Cloudflare Worker
│   ├── src/
│   │   ├── providers/                   # HijriCalendarProvider interface + Umm al-Qura
│   │   ├── config.ts                    # YAML parse + zod validation
│   │   ├── occurrences.ts               # config → occurrence list (pure)
│   │   ├── ics.ts                       # occurrence list → ICS text (pure, RFC 5545)
│   │   ├── feed-handler.ts              # GET/HEAD /feed/<token>.ics
│   │   ├── healthcheck.ts               # cron self-check + Healthchecks.io ping
│   │   ├── bundle.ts, bundle-cli.ts     # deploy-time config validation + bundling
│   │   ├── cli.ts                       # `make ical` entry point
│   │   └── index.ts
│   └── test/                            # Tier 1 tests; spot-check/ is Tier 3 (network)
├── infrastructure/terraform/
│   └── _modules/hijri-cadence-environment/   # reusable Terraform module
├── examples/events.example.yaml         # fictitious sample config
└── docs/
```

## License

MIT — see [`LICENSE`](LICENSE).
