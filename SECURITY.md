# Security Policy

## Supported Versions

Only the latest minor release on the `0.x` line is supported while the project is pre-1.0.

## Reporting a Vulnerability

Please report suspected security issues privately via
[GitHub Security Advisories](https://github.com/alghanmi/hijri-cadence/security/advisories/new).

If GitHub is unavailable, email `alghanmi@gmail.com` with the subject line
`[hijri-cadence security]`.

I aim to acknowledge reports within 3 business days and to have a fix or
mitigation within 30 days for high-severity issues.

## Scope

In scope:

- The Worker source in `worker/src/`
- The Terraform module in `infrastructure/terraform/_modules/hijri-cadence-environment/`
- Any published release on the `alghanmi/hijri-cadence` GitHub repo

Out of scope:

- Third-party dependencies (report upstream)
- The published feed at `cadence.forklabs.cc` — that's a personal deployment;
  its operational security is separate from this open-source project

## Non-goals

This project is not a fiqh authority. Umm al-Qura is a tabular calendar
suitable for scheduling but not for determining Ramadan / Eid start dates,
which depend on moon sighting. Reporting "the tool disagrees with local
sighting" is not a security issue.
