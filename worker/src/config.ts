import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Config schema per the design doc §7. Kept intentionally small — every
 * field maps to observable behavior in the generated ICS.
 *
 * Validation errors from zod bubble up with the field path intact; the
 * feed handler catches them and returns 500 with a diagnostic (never
 * echoes the offending value, which may include personal info).
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

const configSchema = z.object({
  calendar: z.string().min(1),
  occurrence_range: occurrenceRangeSchema.default({ years_back: 3, years_forward: 6 }),
  events: z.array(eventSchema).min(1),
});

export type Config = z.infer<typeof configSchema>;
export type EventConfig = z.infer<typeof eventSchema>;
export type OccurrenceRange = z.infer<typeof occurrenceRangeSchema>;

/** Parse + validate a raw YAML string. Throws on invalid input. */
export function parseConfig(source: string): Config {
  const raw: unknown = parseYaml(source);
  return configSchema.parse(raw);
}

/**
 * Validate an already-parsed object (e.g. produced by JSON.parse of a
 * config bundled via `--define CONFIGS_JSON`). Same schema as
 * `parseConfig`.
 */
export function validateConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}
