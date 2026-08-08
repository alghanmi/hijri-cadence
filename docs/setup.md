# Local dev setup

## Prerequisites

- Node 22+ and pnpm 10+ (see `package.json` → `packageManager`)
- Terraform ≥ 1.9 (only if you're touching the module)

## First run

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

The four commands correspond to the four gates in `pr-checks.yml`.
They all run without any Cloudflare credentials or network access —
`vitest` uses `@cloudflare/vitest-pool-workers` under `workerd`, and
the config file is the fictitious `examples/events.example.yaml`.

## Generate an ICS file locally

Renders an `.ics` from the example config to disk. No Worker, no
network, no deploy — same code path as the production feed handler.

```sh
pnpm --filter @hijri-cadence/worker generate:local -- \
  --config examples/events.example.yaml \
  --out /tmp/events.ics
```

Or, from the deploy repo:

```sh
make ical-local CONFIG=examples/events.example.yaml OUT=/tmp/events.ics
```

Open `/tmp/events.ics` in Calendar.app (macOS) or import it in Google
Calendar to see the output rendered.

## Run the Worker locally

```sh
cp worker/.dev.vars.example worker/.dev.vars   # edit as needed
pnpm --filter @hijri-cadence/worker dev
```

`wrangler dev` uses the placeholders in `wrangler.toml` `[define]` — so
`CONFIGS_JSON` is `{}` and every feed URL returns 404. That's expected;
local dev exercises the healthcheck and routing, not per-family feeds.

## Run the Tier 3 spot-check

Hits the live Aladhan API to cross-check golden pairs against a
different implementation of Umm al-Qura. Requires a network.

```sh
pnpm --filter @hijri-cadence/worker spot-check
```

Reports on stderr. Exits non-zero if any pair mismatches. Not part of
`pnpm test` by design — see `docs/architecture.md` for the testing
tiers rationale.

## Adding a new HijriCalendarProvider

1. Add `worker/src/providers/<your-provider>.ts` implementing the
   `HijriCalendarProvider` interface.
2. Register it at module init: `registerProvider(myProvider)`.
3. Import it from `worker/src/index.ts` for the side effect.
4. Users select it by setting `calendar: <your-id>` in their YAML.
5. Add unit tests in `worker/test/` and (optionally) additional
   golden pairs to `healthcheck.ts`.

## Terraform

The module lives in
`infrastructure/terraform/_modules/hijri-cadence-environment/`. The
environment (backend, tfvars) lives in the private companion repo
(`hijri-cadence-deploy`) — nothing in this repo needs Cloudflare
credentials to develop.

```sh
cd infrastructure/terraform/_modules/hijri-cadence-environment
terraform init -backend=false
terraform validate
terraform fmt -check
```

CI enforces `terraform fmt -check -recursive` + `terraform validate` on
every PR touching `infrastructure/terraform/**`.
