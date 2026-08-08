import { ummAlQuraProvider } from './providers/umm-al-qura.js';
import type { Logger } from './logger.js';

/**
 * Golden-vector pairs cross-checked against published Umm al-Qura
 * reference data. Runs BOTH in Tier 1 unit tests (worker/test/conversion.test.ts)
 * AND inside the deployed Worker as a Cron-Trigger self-check (Tier 2 —
 * catches `workerd`-vs-CI runtime drift).
 *
 * Keep the list small — this is a canary, not a full validation suite.
 * Comprehensive validation lives in conversion.test.ts.
 */
export const GOLDEN_PAIRS: ReadonlyArray<{
  hijri: [number, number, number];
  gregorian: [number, number, number];
  label: string;
}> = [
  // Reference dates from the Umm al-Qura calendar (Saudi authority)
  // published tables. These are calendar-authority dates, not personal.
  { hijri: [1443, 1, 1], gregorian: [2021, 8, 9], label: '1 Muharram 1443 AH' },
  { hijri: [1444, 1, 1], gregorian: [2022, 7, 30], label: '1 Muharram 1444 AH' },
  { hijri: [1445, 1, 1], gregorian: [2023, 7, 19], label: '1 Muharram 1445 AH' },
  { hijri: [1446, 1, 1], gregorian: [2024, 7, 7], label: '1 Muharram 1446 AH' },
  { hijri: [1447, 1, 1], gregorian: [2025, 6, 26], label: '1 Muharram 1447 AH' },
];

export interface SelfCheckResult {
  passed: boolean;
  mismatches: Array<{ label: string; expected: string; actual: string }>;
}

/**
 * Run every golden pair through the default provider. Deterministic — no
 * I/O, no `now`.
 */
export function runSelfCheck(): SelfCheckResult {
  const mismatches: SelfCheckResult['mismatches'] = [];
  for (const pair of GOLDEN_PAIRS) {
    const [hy, hm, hd] = pair.hijri;
    const [gy, gm, gd] = pair.gregorian;
    const actual = ummAlQuraProvider.toGregorian(hy, hm, hd);
    const expected = new Date(Date.UTC(gy, gm - 1, gd));
    if (actual.getTime() !== expected.getTime()) {
      mismatches.push({
        label: pair.label,
        expected: expected.toISOString().slice(0, 10),
        actual: actual.toISOString().slice(0, 10),
      });
    }
  }
  return { passed: mismatches.length === 0, mismatches };
}

/**
 * Cron-Trigger entrypoint. Runs `runSelfCheck()`; on success, pings
 * `HEARTBEAT_URL` (empty disables the ping). On failure, logs the
 * mismatches and pings `<HEARTBEAT_URL>/fail` so Healthchecks.io opens
 * an incident.
 */
export async function scheduledHealthcheck(
  logger: Logger,
  heartbeatUrl: string | undefined,
): Promise<void> {
  const result = runSelfCheck();
  if (result.passed) {
    logger.info('healthcheck.pass', { pairs: GOLDEN_PAIRS.length });
  } else {
    logger.error('healthcheck.fail', {
      pairs: GOLDEN_PAIRS.length,
      mismatches: result.mismatches,
    });
  }

  if (heartbeatUrl === undefined || heartbeatUrl === '') return;

  const url = result.passed ? heartbeatUrl : `${heartbeatUrl}/fail`;
  try {
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      logger.warn('healthcheck.heartbeat_bad_status', { status: resp.status });
    }
  } catch (err) {
    logger.warn('healthcheck.heartbeat_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
