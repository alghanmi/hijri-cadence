import type { Occurrence } from './occurrences.js';

/**
 * RFC 5545 ICS text generation. Pure. Given occurrences[] → deterministic
 * ICS string. No I/O.
 *
 * Design choices:
 *   - All-day VEVENTs (DTSTART;VALUE=DATE:YYYYMMDD, DTEND = next day) —
 *     Hijri events don't carry a time-of-day.
 *   - One VALARM per entry in `reminder_days_before`.
 *   - Age suffix in SUMMARY iff the occurrence has an `age` value.
 *   - Stable, deterministic UIDs derived from event name + occurrence
 *     year (so a calendar client can dedupe if the same feed is imported
 *     twice).
 *   - CRLF line endings + 75-octet line folding per RFC 5545 §3.1.
 */

export interface IcsOptions {
  /** Calendar name shown in most clients. Defaults to "Hijri Cadence". */
  calendarName?: string;
  /** Optional per-feed identifier included in every UID (e.g. token). */
  feedId?: string;
  /** Injected clock for tests; defaults to `new Date()`. */
  now?: Date;
}

export function generateIcs(occurrences: Occurrence[], opts: IcsOptions = {}): string {
  const calendarName = opts.calendarName ?? 'Hijri Cadence';
  const now = opts.now ?? new Date();
  const stamp = formatIcsDateTime(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hijri-cadence//v1//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const occ of occurrences) {
    lines.push(...renderEvent(occ, stamp, opts.feedId));
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function renderEvent(occ: Occurrence, stamp: string, feedId: string | undefined): string[] {
  const start = formatIcsDate(occ.date);
  const endDate = new Date(occ.date);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = formatIcsDate(endDate);

  const summary = occ.age !== undefined ? `${occ.event.name} (${occ.age})` : occ.event.name;

  const uid = buildUid(occ, feedId);

  const eventLines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeText(summary)}`,
    'TRANSP:TRANSPARENT',
    `X-HIJRI-YEAR:${occ.hijriYear}`,
  ];

  for (const daysBefore of occ.event.reminder_days_before) {
    eventLines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(summary)}`,
      `TRIGGER:-P${daysBefore}D`,
      'END:VALARM',
    );
  }

  eventLines.push('END:VEVENT');
  return eventLines;
}

function buildUid(occ: Occurrence, feedId: string | undefined): string {
  const slug = slugify(occ.event.name);
  const feedPart = feedId !== undefined ? `${feedId}.` : '';
  return `${feedPart}${slug}.${occ.hijriYear}@hijri-cadence`;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event'
  );
}

function formatIcsDate(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatIcsDateTime(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const hh = date.getUTCHours().toString().padStart(2, '0');
  const mm = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding: no line may exceed 75 octets, longer lines
 * are split with a CRLF + single leading whitespace on continuation.
 */
function foldLine(line: string): string {
  const maxOctets = 75;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= maxOctets) return line;

  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    const end = Math.min(start + (out.length === 0 ? maxOctets : maxOctets - 1), bytes.length);
    // Back off if we'd split a UTF-8 continuation byte
    let safeEnd = end;
    while (safeEnd > start) {
      const byte = bytes[safeEnd - 1];
      if (byte === undefined || (byte & 0xc0) !== 0x80) break;
      safeEnd--;
    }
    const chunk = new TextDecoder().decode(bytes.slice(start, safeEnd));
    out.push(out.length === 0 ? chunk : ' ' + chunk);
    start = safeEnd;
  }
  return out.join('\r\n');
}
