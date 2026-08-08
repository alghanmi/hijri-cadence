import { hijriToGregorian, gregorianToHijri } from '@tabby_ai/hijri-converter';
import { registerProvider, type HijriCalendarProvider } from './provider.js';

/**
 * Umm al-Qura Hijri↔Gregorian conversion, backed by
 * `@tabby_ai/hijri-converter` (TypeScript port of the reference Python
 * `hijri-converter` library). Covers 1343–1500 AH (roughly 1924–2077 CE).
 *
 * All calls into `@tabby_ai/hijri-converter` are isolated to this file —
 * nothing else in the Worker imports from it directly. That keeps the
 * provider interface swappable and confines the library's API shape to
 * one place.
 */
export const ummAlQuraProvider: HijriCalendarProvider = {
  id: 'umm_al_qura',

  toGregorian(hijriYear, hijriMonth, hijriDay) {
    const g = hijriToGregorian({ year: hijriYear, month: hijriMonth, day: hijriDay });
    // Anchor at UTC midnight so downstream ICS generation sees a stable
    // calendar-date value regardless of the Worker's TZ (which is UTC).
    return new Date(Date.UTC(g.year, g.month - 1, g.day));
  },

  currentHijriYear(gregorianDate) {
    const h = gregorianToHijri({
      year: gregorianDate.getUTCFullYear(),
      month: gregorianDate.getUTCMonth() + 1,
      day: gregorianDate.getUTCDate(),
    });
    return h.year;
  },
};

registerProvider(ummAlQuraProvider);
