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

describe('generateOccurrences — future hijri_year regression', () => {
  // Event whose hijri_year lands AFTER the current window's start —
  // simulates a recently-born child. Before the fix, materializeOccurrence
  // would emit VEVENTs for pre-birth years with negative ages.
  const FUTURE_BIRTH_YAML = `calendar: umm_al_qura
occurrence_range:
  years_back: 5
  years_forward: 5
events:
  - name: "Newborn"
    hijri_day: 1
    hijri_month: 1
    hijri_year: 1447
    reminder_days_before: []
  - name: "Undated Observance"
    hijri_day: 1
    hijri_month: 1
    reminder_days_before: []
`;

  it('does not emit occurrences before the event hijri_year', () => {
    // "now" in 1446 (2024-07-07 → 1 Muharram 1446). years_back: 5 means
    // the window includes 1441..1451. Newborn's hijri_year is 1447 → only
    // 1447..1451 should appear (5 occurrences), not 1441..1446.
    const now = new Date(Date.UTC(2024, 6, 7));
    const config = parseConfig(FUTURE_BIRTH_YAML);
    const occurrences = generateOccurrences(config, now);
    const newborn = occurrences.filter((o) => o.event.name === 'Newborn');

    expect(newborn.length).toBeGreaterThan(0);
    for (const o of newborn) {
      expect(o.hijriYear).toBeGreaterThanOrEqual(1447);
      expect(o.age).toBeDefined();
      expect(o.age).toBeGreaterThanOrEqual(0);
    }
  });

  it('still emits pre-window occurrences for events WITHOUT hijri_year', () => {
    // The undated observance has no hijri_year, so it should fill the
    // whole 11-year window regardless.
    const now = new Date(Date.UTC(2024, 6, 7));
    const config = parseConfig(FUTURE_BIRTH_YAML);
    const occurrences = generateOccurrences(config, now);
    const undated = occurrences.filter((o) => o.event.name === 'Undated Observance');

    expect(undated.length).toBeGreaterThan(6); // clearly more than the newborn's 5
    for (const o of undated) {
      expect(o.age).toBeUndefined();
    }
  });
});
