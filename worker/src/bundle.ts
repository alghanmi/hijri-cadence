import { parse as parseYaml, YAMLParseError } from 'yaml';
import type { ZodError } from 'zod';
import { personConfigSchema } from './config.js';

/**
 * Deploy-time config bundling: every per-person YAML file → one JSON object
 * keyed by token, which the deploy pipeline bakes into the Worker as
 * `CONFIGS_JSON`. Pure (no fs) so it runs under the workerd test pool; the
 * CLI in bundle-cli.ts does the file I/O.
 *
 * Error messages name the file and field path but never echo values —
 * configs hold personal data and deploy logs are not the place for it.
 */

export interface ConfigFile {
  /** Display name used in error messages (e.g. `people/layla.yaml`). */
  file: string;
  source: string;
}

export interface BundleResult {
  /** Compact JSON: `{ "<token>": { calendar, occurrence_range, events } }`. */
  json: string;
  count: number;
  tokens: string[];
}

export class BundleError extends Error {
  constructor(readonly problems: string[]) {
    super(`config bundle invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'BundleError';
  }
}

export function bundleConfigs(
  files: readonly ConfigFile[],
  options: { allowEmpty?: boolean } = {},
): BundleResult {
  const problems: string[] = [];
  const bundle: Record<string, unknown> = {};
  const tokenOwner = new Map<string, string>();

  if (files.length === 0 && options.allowEmpty !== true) {
    problems.push('no config files found — refusing to deploy an empty bundle');
  }

  for (const { file, source } of files) {
    let raw: unknown;
    try {
      raw = parseYaml(source);
    } catch (err) {
      problems.push(`${file}: ${describeYamlError(err)}`);
      continue;
    }

    const parsed = personConfigSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(...describeZodError(file, parsed.error));
      continue;
    }

    const { token, ...config } = parsed.data;
    const owner = tokenOwner.get(token);
    if (owner !== undefined) {
      problems.push(`${file}: token is already used by ${owner}`);
      continue;
    }
    tokenOwner.set(token, file);
    bundle[token] = config;
  }

  if (problems.length > 0) throw new BundleError(problems);

  const tokens = [...tokenOwner.keys()];
  return { json: JSON.stringify(bundle), count: tokens.length, tokens };
}

function describeYamlError(err: unknown): string {
  if (err instanceof YAMLParseError) {
    const pos = err.linePos?.[0];
    const where = pos === undefined ? '' : ` at line ${pos.line}, column ${pos.col}`;
    return `YAML parse error (${err.code})${where}`;
  }
  return 'YAML parse error';
}

function describeZodError(file: string, error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${file}: ${path}: ${issue.message}`;
  });
}
