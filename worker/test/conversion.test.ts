// Provider self-registration side-effect (see src/index.ts rationale)
import '../src/providers/umm-al-qura.js';

import { describe, expect, it } from 'vitest';
import { GOLDEN_PAIRS, runSelfCheck } from '../src/healthcheck.js';
import { ummAlQuraProvider } from '../src/providers/umm-al-qura.js';

describe('umm_al_qura provider — golden vectors', () => {
  for (const pair of GOLDEN_PAIRS) {
    it(`converts ${pair.label} → ${pair.gregorian.join('-')}`, () => {
      const [hy, hm, hd] = pair.hijri;
      const [gy, gm, gd] = pair.gregorian;
      const actual = ummAlQuraProvider.toGregorian(hy, hm, hd);
      const expected = new Date(Date.UTC(gy, gm - 1, gd));
      expect(actual.toISOString()).toBe(expected.toISOString());
    });
  }

  it('runSelfCheck() passes for the shipped golden pairs', () => {
    const result = runSelfCheck();
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('currentHijriYear() maps a known Gregorian date to the expected Hijri year', () => {
    // 2024-07-07 is 1 Muharram 1446 AH per the golden table.
    const y = ummAlQuraProvider.currentHijriYear(new Date(Date.UTC(2024, 6, 7)));
    expect(y).toBe(1446);
  });
});
