import '../src/providers/umm-al-qura.js';

import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { generateIcs } from '../src/ics.js';
import { generateOccurrences } from '../src/occurrences.js';
import { EXAMPLE_YAML } from './fixtures.js';

const NOW = new Date(Date.UTC(2025, 0, 1));

function build(): string {
  const config = parseConfig(EXAMPLE_YAML);
  const occurrences = generateOccurrences(config, NOW);
  return generateIcs(occurrences, { now: NOW });
}

describe('generateIcs — RFC 5545 shape', () => {
  const ics = build();

  it('wraps output in VCALENDAR envelope', () => {
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//hijri-cadence//v1//EN');
  });

  it('uses CRLF line endings throughout', () => {
    const lines = ics.split('\r\n');
    expect(lines.length).toBeGreaterThan(5);
    // No stray \n without \r
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('emits one VEVENT per occurrence with all-day DATE values', () => {
    const eventStarts = ics.match(/BEGIN:VEVENT/g) ?? [];
    const eventEnds = ics.match(/END:VEVENT/g) ?? [];
    expect(eventStarts.length).toBe(eventEnds.length);
    expect(eventStarts.length).toBeGreaterThan(0);
    expect(ics).toContain('DTSTART;VALUE=DATE:');
    expect(ics).toContain('DTEND;VALUE=DATE:');
  });

  it('emits SUMMARY with age suffix when hijri_year is set', () => {
    expect(ics).toMatch(/SUMMARY:Layla's Hijri Birthday \(\d+\)/);
  });

  it('emits SUMMARY without age suffix when hijri_year is unset', () => {
    expect(ics).toMatch(/SUMMARY:Family Anniversary\r\n/);
  });

  it('emits one VALARM per entry in reminder_days_before', () => {
    // Layla's Hijri Birthday: reminder_days_before: [1, 7]
    // Family Anniversary:    reminder_days_before: []
    const config = parseConfig(EXAMPLE_YAML);
    const occurrences = generateOccurrences(config, NOW);
    const laylaCount = occurrences.filter((o) => o.event.name === "Layla's Hijri Birthday").length;
    const alarmCount = (ics.match(/BEGIN:VALARM/g) ?? []).length;
    expect(alarmCount).toBe(laylaCount * 2);
  });

  it('includes reminder TRIGGER offsets', () => {
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-P7D');
  });

  it('emits stable X-HIJRI-YEAR extension for each occurrence', () => {
    const yearMarkers = ics.match(/X-HIJRI-YEAR:\d+/g) ?? [];
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(yearMarkers.length).toBe(eventCount);
  });
});
