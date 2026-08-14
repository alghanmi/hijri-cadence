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

describe('generateIcs — UTF-8 line folding regression', () => {
  // Arabic name long enough to force a fold at 75 octets. Each Arabic
  // letter encodes to 2 UTF-8 bytes; SUMMARY: prefix + escaping mean a
  // long-enough name lands the fold boundary mid-character.
  const ARABIC = 'ليلى الغانمي عيد ميلاد هجري كبير للاختبار';
  const YAML = `calendar: umm_al_qura
occurrence_range:
  years_back: 0
  years_forward: 1
events:
  - name: "${ARABIC}"
    hijri_day: 7
    hijri_month: 10
    reminder_days_before: []
`;

  it('does not corrupt multi-byte characters when folding lines >75 octets', () => {
    const config = parseConfig(YAML);
    const occurrences = generateOccurrences(config, NOW);
    const ics = generateIcs(occurrences, { now: NOW });

    // No U+FFFD replacement characters — that would signal TextDecoder
    // failed on a truncated multi-byte sequence.
    expect(ics).not.toContain('�');
    // The full Arabic name must appear intact somewhere in the output
    // (possibly with a fold-injected " \r\n " sequence, which is stripped
    // when re-joining continuation lines).
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(ARABIC);
  });
});

describe('escapeText — control characters', () => {
  it('strips \\r injection from event names', () => {
    const YAML = `calendar: umm_al_qura
occurrence_range:
  years_back: 0
  years_forward: 0
events:
  - name: "Innocuous\\r\\nBEGIN:VEVENT\\r\\nSUMMARY:INJECTED\\r\\nEND:VEVENT"
    hijri_day: 1
    hijri_month: 1
    reminder_days_before: []
`;
    const config = parseConfig(YAML);
    const occurrences = generateOccurrences(config, NOW);
    const ics = generateIcs(occurrences, { now: NOW });

    // Split into logical lines (unfold continuation lines first — RFC 5545
    // continuations are marked by a leading space after CRLF).
    const logicalLines = ics.replace(/\r\n /g, '').split('\r\n');

    // Only one actual VEVENT wrapper — the injected structure must NOT
    // create a second, real VEVENT block. Check line-anchored: a line
    // whose full content is BEGIN:VEVENT / END:VEVENT (the substring can
    // appear as part of an escaped SUMMARY value, which is inert).
    const beginLines = logicalLines.filter((l) => l === 'BEGIN:VEVENT');
    const endLines = logicalLines.filter((l) => l === 'END:VEVENT');
    expect(beginLines.length).toBe(1);
    expect(endLines.length).toBe(1);

    // There must be exactly one SUMMARY property line, and it must not
    // contain a raw CR (raw CR would let the string break out into a real
    // continuation of the VEVENT block).
    const summaryLines = logicalLines.filter((l) => l.startsWith('SUMMARY:'));
    expect(summaryLines.length).toBe(1);
    expect(summaryLines[0]).not.toContain('\r');
  });
});
