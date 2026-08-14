import type { Config, EventConfig } from './config.js';
import { getProvider, type HijriCalendarProvider } from './providers/provider.js';

/**
 * A single Gregorian occurrence of a configured Hijri event.
 * `date` is anchored at UTC midnight (see provider contract). `age` is
 * populated only when the config's `hijri_year` is set — it's the
 * per-occurrence Hijri-year delta, computed against the specific
 * occurrence being materialized (NOT against "today").
 */
export interface Occurrence {
  event: EventConfig;
  date: Date;
  /** Hijri year this occurrence lands in. */
  hijriYear: number;
  /** Age in Hijri years for THIS occurrence, or undefined if hijri_year not set. */
  age?: number;
}

/**
 * Materialize every Gregorian occurrence of every configured event that
 * falls within the range `[currentHijriYear - years_back,
 * currentHijriYear + years_forward]` — inclusive at both ends.
 *
 * Pure. Given (config, now) → deterministic (occurrences[]). No I/O.
 * Shared verbatim between the Worker's feed handler and the local CLI.
 */
export function generateOccurrences(config: Config, now: Date = new Date()): Occurrence[] {
  const provider = getProvider(config.calendar);
  const currentYear = provider.currentHijriYear(now);
  const { years_back, years_forward } = config.occurrence_range;

  const startYear = currentYear - years_back;
  const endYear = currentYear + years_forward;

  const results: Occurrence[] = [];
  for (const event of config.events) {
    for (let hy = startYear; hy <= endYear; hy++) {
      const occurrence = materializeOccurrence(provider, event, hy);
      if (occurrence !== null) results.push(occurrence);
    }
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results;
}

function materializeOccurrence(
  provider: HijriCalendarProvider,
  event: EventConfig,
  hijriYear: number,
): Occurrence | null {
  // Skip years before the event's own hijri_year — a birthday for someone
  // born in 1447 doesn't have occurrences in 1445 or 1446, and materializing
  // them would emit VEVENTs with negative ages (e.g. "Alice's Hijri
  // Birthday (-2)"). Events without a hijri_year (undated anniversaries,
  // observances) skip this guard entirely.
  if (event.hijri_year !== undefined && hijriYear < event.hijri_year) {
    return null;
  }

  let date: Date;
  try {
    date = provider.toGregorian(hijriYear, event.hijri_month, event.hijri_day);
  } catch {
    // Provider rejected the date (e.g. 30th of a 29-day Hijri month for
    // this specific year). Skip silently — the event simply doesn't
    // occur that Hijri year.
    return null;
  }

  const occurrence: Occurrence = { event, date, hijriYear };
  if (event.hijri_year !== undefined) {
    occurrence.age = hijriYear - event.hijri_year;
  }
  return occurrence;
}
