import '../src/providers/umm-al-qura.js';

import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { generateOccurrences } from '../src/occurrences.js';
import { EXAMPLE_YAML } from './fixtures.js';

describe('generateOccurrences — using the example config fixture', () => {
  const config = parseConfig(EXAMPLE_YAML);
  // Anchor "now" at a fixed Gregorian date so occurrence counts are
  // deterministic across CI runs. 2025-01-01 falls in Hijri 1446.
  const now = new Date(Date.UTC(2025, 0, 1));

  it('produces (years_back + years_forward + 1) × events occurrences maximum', () => {
    const occurrences = generateOccurrences(config, now);
    const yearsInWindow =
      config.occurrence_range.years_back + config.occurrence_range.years_forward + 1;
    const maxOccurrences = yearsInWindow * config.events.length;
    // Some hijri_day values may not exist in every year (30th of 29-day
    // months); the count is ≤ max, not always exactly max.
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.length).toBeLessThanOrEqual(maxOccurrences);
  });

  it('sorts occurrences by Gregorian date ascending', () => {
    const occurrences = generateOccurrences(config, now);
    for (let i = 1; i < occurrences.length; i++) {
      const prev = occurrences[i - 1];
      const curr = occurrences[i];
      if (prev === undefined || curr === undefined) throw new Error('unreachable');
      expect(curr.date.getTime()).toBeGreaterThanOrEqual(prev.date.getTime());
    }
  });

  it('populates `age` for events with hijri_year, leaves it undefined otherwise', () => {
    const occurrences = generateOccurrences(config, now);
    const layla = occurrences.filter((o) => o.event.name === "Layla's Hijri Birthday");
    const anniv = occurrences.filter((o) => o.event.name === 'Family Anniversary');
    expect(layla.length).toBeGreaterThan(0);
    expect(anniv.length).toBeGreaterThan(0);
    for (const o of layla) {
      expect(o.age).toBeDefined();
      expect(o.age).toBe(o.hijriYear - 1406);
    }
    for (const o of anniv) {
      expect(o.age).toBeUndefined();
    }
  });
});
