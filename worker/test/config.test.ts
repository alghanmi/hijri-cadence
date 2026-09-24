import { describe, expect, it } from 'vitest';
import { parseConfig, personConfigSchema } from '../src/config.js';

const EVENT = `    hijri_day: 1
    hijri_month: 1
    reminder_days_before: []`;

describe('config validation', () => {
  it('rejects an unknown calendar provider', () => {
    const yaml = `calendar: not_a_provider\nevents:\n  - name: "A"\n${EVENT}\n`;
    expect(() => parseConfig(yaml)).toThrow(/unknown calendar provider/);
  });

  it('rejects duplicate events (same name, month, day)', () => {
    const yaml = `calendar: umm_al_qura\nevents:\n  - name: "A"\n${EVENT}\n  - name: "A"\n${EVENT}\n`;
    expect(() => parseConfig(yaml)).toThrow(/duplicate of events\.0/);
  });

  it('allows same name on different dates', () => {
    const yaml = `calendar: umm_al_qura\nevents:\n  - name: "A"\n${EVENT}\n  - name: "A"\n    hijri_day: 2\n    hijri_month: 1\n`;
    expect(parseConfig(yaml).events).toHaveLength(2);
  });

  it('strips token from the feed config', () => {
    const yaml = `calendar: umm_al_qura\ntoken: abc\nevents:\n  - name: "A"\n${EVENT}\n`;
    expect(parseConfig(yaml)).not.toHaveProperty('token');
  });

  describe('personConfigSchema token', () => {
    const base = { calendar: 'umm_al_qura', events: [{ name: 'A', hijri_day: 1, hijri_month: 1 }] };

    it('accepts a 22-char base62 token', () => {
      expect(personConfigSchema.safeParse({ ...base, token: 'A'.repeat(22) }).success).toBe(true);
    });

    it.each([
      ['too short', 'A'.repeat(21)],
      ['hyphen', `${'A'.repeat(22)}-x`],
      ['underscore', `${'A'.repeat(22)}_x`],
    ])('rejects a token that is %s', (_label, token) => {
      expect(personConfigSchema.safeParse({ ...base, token }).success).toBe(false);
    });
  });
});
