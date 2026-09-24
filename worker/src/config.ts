import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
// Registers the default provider so `calendar` validation always sees it.
import './providers/umm-al-qura.js';
import { knownProviderIds } from './providers/provider.js';

/**
 * Config schema per the design doc §7. Kept intentionally small — every
 * field maps to observable behavior in the generated ICS.
 *
 * Validation errors from zod bubble up with the field path intact; callers
 * report the path, never the offending value, which may include personal
 * info.
 */

const HIJRI_MONTH_MIN = 1;
const HIJRI_MONTH_MAX = 12;
const HIJRI_DAY_MIN = 1;
const HIJRI_DAY_MAX = 30;

// Practical bound of Umm al-Qura's published data + every library that
// implements it. Rejecting out-of-range hijri_year values here beats a
// runtime crash inside the provider.
const HIJRI_YEAR_MIN = 1343;
const HIJRI_YEAR_MAX = 1500;

/** Feed tokens: base62, at least 22 chars (≥128 bits of entropy). */
export const TOKEN_PATTERN = /^[A-Za-z0-9]{22,}$/;

const eventSchema = z.object({
  name: z.string().min(1),
  hijri_day: z.number().int().min(HIJRI_DAY_MIN).max(HIJRI_DAY_MAX),
  hijri_month: z.number().int().min(HIJRI_MONTH_MIN).max(HIJRI_MONTH_MAX),
  hijri_year: z.number().int().min(HIJRI_YEAR_MIN).max(HIJRI_YEAR_MAX).optional(),
  reminder_days_before: z.array(z.number().int().nonnegative()).default([]),
});

const occurrenceRangeSchema = z.object({
  years_back: z.number().int().min(0).max(50).default(3),
  years_forward: z.number().int().min(0).max(50).default(6),
});

const calendarSchema = z
  .string()
  .min(1)
  .superRefine((id, ctx) => {
    const known = knownProviderIds();
    if (!known.includes(id)) {
      ctx.addIssue({
        code: 'custom',
        message: `unknown calendar provider (known: ${known.join(', ')})`,
      });
    }
  });

const eventsSchema = z
  .array(eventSchema)
  .min(1)
  .superRefine((events, ctx) => {
    const seen = new Map<string, number>();
    events.forEach((event, index) => {
      const key = `${event.name}\u0000${event.hijri_month}\u0000${event.hijri_day}`;
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, index);
      } else {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: `duplicate of events.${first} (same name, hijri_month, hijri_day)`,
        });
      }
    });
  });

const configSchema = z.object({
  calendar: calendarSchema,
  occurrence_range: occurrenceRangeSchema.default({ years_back: 3, years_forward: 6 }),
  events: eventsSchema,
});

/** A deployable per-person/family config: the feed config plus its token. */
export const personConfigSchema = configSchema.extend({
  token: z.string().regex(TOKEN_PATTERN, 'token must be base62 and at least 22 characters'),
});

export type Config = z.infer<typeof configSchema>;
export type EventConfig = z.infer<typeof eventSchema>;
export type OccurrenceRange = z.infer<typeof occurrenceRangeSchema>;
export type PersonConfig = z.infer<typeof personConfigSchema>;

/** Parse + validate a raw YAML string. Throws on invalid input. Strips `token`. */
export function parseConfig(source: string): Config {
  const raw: unknown = parseYaml(source);
  return configSchema.parse(raw);
}

/**
 * Validate an already-parsed object (e.g. an entry of the bundled
 * `CONFIGS_JSON`). Same schema as `parseConfig`.
 */
export function validateConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}
