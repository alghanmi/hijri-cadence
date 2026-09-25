import { describe, expect, it } from 'vitest';
import { BundleError, bundleConfigs, type ConfigFile } from '../src/bundle.js';

const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'BBBBBBBBBBBBBBBBBBBBBB';

function config(token: string, extra = ''): string {
  return `token: ${token}
calendar: umm_al_qura
events:
  - name: "Secret Name"
    hijri_day: 7
    hijri_month: 10
    reminder_days_before: [1]
${extra}`;
}

function problemsOf(files: ConfigFile[]): string[] {
  try {
    bundleConfigs(files);
  } catch (err) {
    if (err instanceof BundleError) return err.problems;
    throw err;
  }
  throw new Error('expected BundleError');
}

describe('bundleConfigs', () => {
  it('bundles valid configs keyed by token, without the token field', () => {
    const result = bundleConfigs([
      { file: 'people/a.yaml', source: config(TOKEN_A) },
      { file: 'people/b.yaml', source: config(TOKEN_B) },
    ]);
    expect(result.count).toBe(2);
    expect(result.tokens).toEqual([TOKEN_A, TOKEN_B]);
    const parsed = JSON.parse(result.json) as Record<string, Record<string, unknown>>;
    expect(Object.keys(parsed)).toEqual([TOKEN_A, TOKEN_B]);
    expect(parsed[TOKEN_A]).not.toHaveProperty('token');
    expect(parsed[TOKEN_A]?.occurrence_range).toEqual({ years_back: 3, years_forward: 6 });
  });

  it('rejects a duplicate token instead of merging', () => {
    const problems = problemsOf([
      { file: 'people/a.yaml', source: config(TOKEN_A) },
      { file: 'people/b.yaml', source: config(TOKEN_A) },
    ]);
    expect(problems).toEqual(['people/b.yaml: token is already used by people/a.yaml']);
  });

  it('rejects an empty set unless allowed', () => {
    expect(problemsOf([])).toEqual(['no config files found — refusing to deploy an empty bundle']);
    expect(bundleConfigs([], { allowEmpty: true }).json).toBe('{}');
  });

  it.each([
    ['short token', config('short'), /token: token must be base62/],
    ['missing token', config(TOKEN_A).replace(/^token:.*\n/, ''), /\(root\)|token:/],
    [
      'unknown calendar',
      config(TOKEN_A).replace('umm_al_qura', 'other'),
      /calendar: unknown calendar/,
    ],
    ['bad day', config(TOKEN_A).replace('hijri_day: 7', 'hijri_day: 31'), /events\.0\.hijri_day/],
  ])('reports %s with the file and field path', (_label, source, pattern) => {
    const problems = problemsOf([{ file: 'people/a.yaml', source }]);
    expect(problems.join('\n')).toMatch(pattern);
    expect(problems.every((p) => p.startsWith('people/a.yaml: '))).toBe(true);
  });

  it('collects problems across files', () => {
    const problems = problemsOf([
      { file: 'people/a.yaml', source: config('short') },
      {
        file: 'people/b.yaml',
        source: config(TOKEN_B).replace('hijri_month: 10', 'hijri_month: 13'),
      },
    ]);
    expect(problems.some((p) => p.startsWith('people/a.yaml'))).toBe(true);
    expect(problems.some((p) => p.startsWith('people/b.yaml'))).toBe(true);
  });

  it('never echoes config values in diagnostics', () => {
    const broken = config(TOKEN_A) + '  - name: "Secret Name\n    hijri_day: [\n';
    const problems = problemsOf([
      { file: 'people/a.yaml', source: broken },
      { file: 'people/b.yaml', source: config('SecretToken') },
    ]);
    const text = problems.join('\n');
    expect(text).toMatch(/people\/a\.yaml: YAML parse error/);
    expect(text).not.toContain('Secret Name');
    expect(text).not.toContain('SecretToken');
  });
});
