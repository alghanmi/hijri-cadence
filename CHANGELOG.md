# Changelog

## [0.2.1](https://github.com/alghanmi/hijri-cadence/compare/v0.2.0...v0.2.1) (2026-09-25)


### Bug Fixes

* keep Workers Logs on across deploys ([#33](https://github.com/alghanmi/hijri-cadence/issues/33)) ([fe2f6f9](https://github.com/alghanmi/hijri-cadence/commit/fe2f6f94b59de7e41c65127b3ed2d044d95374d2))

## [0.2.0](https://github.com/alghanmi/hijri-cadence/compare/v0.1.0...v0.2.0) (2026-09-25)


### ⚠ BREAKING CHANGES

* the module no longer accepts log_level, heartbeat_url or compatibility_date. Pass the vars to `wrangler deploy --var` and set the compatibility date in wrangler.toml. The `[observability]` table was removed from wrangler.toml; Terraform owns those settings.

### Bug Fixes

* manage the Worker with code-less cloudflare_worker ([#31](https://github.com/alghanmi/hijri-cadence/issues/31)) ([8eb9ec8](https://github.com/alghanmi/hijri-cadence/commit/8eb9ec8a4b4c5e8ea18a9d4b2b50f650057fd959))

## 0.1.0 (2026-09-25)


### Features

* bundle-configs CLI, Makefile, and bundle build in CI ([#28](https://github.com/alghanmi/hijri-cadence/issues/28)) ([5a246b2](https://github.com/alghanmi/hijri-cadence/commit/5a246b24bea70a01acceb5694569eee43a46e806))


### Bug Fixes

* correctness bugs surfaced by adversarial review ([#12](https://github.com/alghanmi/hijri-cadence/issues/12)) ([3d865da](https://github.com/alghanmi/hijri-cadence/commit/3d865dac715b91b3bd5301669fd9216d7fd0b57f))
* correctness fixes before first release ([#26](https://github.com/alghanmi/hijri-cadence/issues/26)) ([9f86574](https://github.com/alghanmi/hijri-cadence/commit/9f86574d3b94747add98607f548f6646d3a3ee9e))
* make Terraform the sole owner of cron and Worker metadata ([#27](https://github.com/alghanmi/hijri-cadence/issues/27)) ([cd8d2f8](https://github.com/alghanmi/hijri-cadence/commit/cd8d2f83f28f30ef8a502e2b58067ecfe9537f40))


### Miscellaneous Chores

* pin first release to v0.1.0 ([5f3be35](https://github.com/alghanmi/hijri-cadence/commit/5f3be350d865e3e2f4baf4bb8d0145e39b449337))
