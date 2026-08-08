#!/usr/bin/env tsx
/**
 * Tier 3 — third-party validation via the Aladhan Islamic Calendar API.
 *
 * DELIBERATELY not part of `pnpm test` / `pr-checks.yml` — it depends on
 * an external service being up, which contradicts the "no live network
 * calls in CI" rule. Runnable on demand via:
 *
 *   pnpm --filter @hijri-cadence/worker spot-check
 *   # or from the deploy repo:
 *   make spot-check
 *
 * What it does: takes the same golden-vector table from Tier 1
 * (src/healthcheck.ts), calls Aladhan's /v1/hToG endpoint with
 * `calendarMethod=UAQ` (Umm al-Qura — same authority this project
 * defaults to), and diffs the returned Gregorian date against the local
 * `@tabby_ai/hijri-converter` output. Reports mismatches on stderr and
 * exits non-zero.
 *
 * Aladhan docs: https://aladhan.com/islamic-calendar-api
 */

import '../../src/providers/umm-al-qura.js';

import { GOLDEN_PAIRS } from '../../src/healthcheck.js';
import { ummAlQuraProvider } from '../../src/providers/umm-al-qura.js';

const ALADHAN_BASE = 'https://api.aladhan.com/v1/hToG';

interface AladhanResponse {
  data?: {
    gregorian?: {
      date?: string; // DD-MM-YYYY
    };
  };
}

async function fetchAladhanGregorian(hy: number, hm: number, hd: number): Promise<Date | null> {
  const dd = String(hd).padStart(2, '0');
  const mm = String(hm).padStart(2, '0');
  const url = `${ALADHAN_BASE}/${dd}-${mm}-${hy}?calendarMethod=UAQ`;
  const resp = await fetch(url);
  if (!resp.ok) {
    process.stderr.write(`  ! HTTP ${resp.status} for ${url}\n`);
    return null;
  }
  const body = (await resp.json()) as AladhanResponse;
  const raw = body.data?.gregorian?.date;
  if (raw === undefined) return null;
  const parts = raw.split('-').map((s) => Number.parseInt(s, 10));
  if (parts.length !== 3) return null;
  const [d, m, y] = parts as [number, number, number];
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

async function main(): Promise<void> {
  let mismatches = 0;
  process.stderr.write(
    `Running Aladhan spot-check against ${GOLDEN_PAIRS.length} golden pairs...\n\n`,
  );

  for (const pair of GOLDEN_PAIRS) {
    const [hy, hm, hd] = pair.hijri;
    const local = ummAlQuraProvider.toGregorian(hy, hm, hd);
    const remote = await fetchAladhanGregorian(hy, hm, hd);

    if (remote === null) {
      process.stderr.write(`  ? ${pair.label}: Aladhan returned no data (skipped)\n`);
      continue;
    }

    if (local.getTime() === remote.getTime()) {
      process.stderr.write(`  ✓ ${pair.label} → ${local.toISOString().slice(0, 10)}\n`);
    } else {
      process.stderr.write(
        `  ✗ ${pair.label}: local=${local.toISOString().slice(0, 10)} aladhan=${remote.toISOString().slice(0, 10)}\n`,
      );
      mismatches++;
    }
  }

  process.stderr.write(
    `\n${mismatches === 0 ? '✅ All pairs match.' : `❌ ${mismatches} mismatch(es).`}\n`,
  );
  process.exit(mismatches === 0 ? 0 : 1);
}

void main();
