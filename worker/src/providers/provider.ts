/**
 * Pluggable Hijri↔Gregorian calendar authority.
 *
 * v1 ships only the `umm_al_qura` implementation. Additional providers
 * (a tabular/arithmetic civil calendar, a different regional authority,
 * etc.) register under their own `id` and are selected per-config by the
 * `calendar` field in each YAML.
 */
export interface HijriCalendarProvider {
  /** Provider identifier used in the config `calendar` field. */
  readonly id: string;

  /**
   * Convert a Hijri (AH) date to its Gregorian equivalent.
   * Callers must not assume the returned Date carries any timezone
   * information — treat it as a date-only value in the calendar sense.
   */
  toGregorian(hijriYear: number, hijriMonth: number, hijriDay: number): Date;

  /**
   * The current Hijri year at the given Gregorian date. Used to determine
   * which Hijri years' occurrences to materialize into the feed window.
   */
  currentHijriYear(gregorianDate: Date): number;
}

/**
 * Registry of provider `id` → implementation. Populated at module init by
 * each provider file registering itself via `registerProvider`.
 */
const registry = new Map<string, HijriCalendarProvider>();

export function registerProvider(provider: HijriCalendarProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: string): HijriCalendarProvider {
  const provider = registry.get(id);
  if (provider === undefined) {
    throw new Error(
      `Unknown HijriCalendarProvider id: "${id}". Known ids: ${[...registry.keys()].join(', ') || '(none registered)'}`,
    );
  }
  return provider;
}

/** For tests + diagnostics. */
export function knownProviderIds(): string[] {
  return [...registry.keys()].sort();
}
