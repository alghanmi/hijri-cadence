# Local dev setup

Every operation below is a `make` target. Run `make help` for the list.

## Prerequisites

- Node 22+ and pnpm 10+ (see `package.json` → `packageManager`)
- GNU Make (preinstalled on macOS and most Linux distributions)
- Terraform ≥ 1.9, only if you're touching the module

## First run

```sh
make install
make check
```

`make check` runs the same gates as `pr-checks.yml`: typecheck, lint,
Prettier format check, and the Tier 1 tests. None of them need Cloudflare
credentials or network access. `vitest` runs under `workerd` via
`@cloudflare/vitest-pool-workers`, and the fixtures are fictitious. CI
also dry-run-builds the deployable bundle (see `.github/workflows/pr-checks.yml`).

## Generate an ICS file locally

Renders an `.ics` from a config file to disk. There's no Worker, network,
or deploy involved, but it runs the same code path as the production feed.

```sh
make ical CONFIG=examples/events.example.yaml OUT=/tmp/events.ics
```

Open `/tmp/events.ics` in Calendar.app (macOS), or import it into Google
Calendar, to see the rendered output.

## Validate deployable configs

A deployable config is an event config plus a `token:` field (base62, at
least 22 characters). The deploy pipeline bundles a directory of them
into the Worker. To check a directory the same way:

```sh
make validate-configs DIR=path/to/people
```

Files named `*.example.yaml` are skipped. Errors name the file and field
path, never the value.

## Run the Worker locally

```sh
cp worker/.dev.vars.example worker/.dev.vars   # edit as needed
make dev
```

`wrangler dev` uses the placeholders in `wrangler.toml` `[define]`, so
`CONFIGS_JSON` is `{}` and every feed URL returns 404. That's expected:
local dev exercises routing, not per-family feeds. Use `make ical` to see
real output.

## Run the Tier 3 spot-check

Calls the live Aladhan API to cross-check the golden pairs against a
different implementation of Umm al-Qura. Requires network access.

```sh
make spot-check
```

It reports on stderr and exits non-zero if any pair mismatches. By
design it's not part of `make check`; see `docs/architecture.md` for the
testing tiers.

## Adding a new HijriCalendarProvider

1. Add `worker/src/providers/<your-provider>.ts` implementing the
   `HijriCalendarProvider` interface.
2. Register it at module init: `registerProvider(myProvider)`.
3. Import it from `worker/src/index.ts` and `worker/src/config.ts` for
   the side effect. Config validation rejects any `calendar:` id that
   isn't registered.
4. Users select it by setting `calendar: <your-id>` in their YAML.
5. Add unit tests in `worker/test/` and, optionally, more golden pairs
   in `healthcheck.ts`.

## Terraform

The module lives in
`infrastructure/terraform/_modules/hijri-cadence-environment/`. The
environment (backend, real values, state) lives in the private deploy
companion, so developing here needs no Cloudflare credentials.

```sh
make tf-check    # fmt -check + init -backend=false + validate
```

CI runs the same checks on every PR touching `infrastructure/terraform/**`.
