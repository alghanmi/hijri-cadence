#!/usr/bin/env tsx
/**
 * Validate and bundle per-person configs for deployment.
 *
 *   bundle-configs --dir <path> [--out <file>] [--check] [--print-tokens] [--allow-empty]
 *
 * Reads every `*.yaml` in --dir (skipping `*.example.yaml`), validates each
 * against the deploy schema, and writes the token-keyed JSON bundle to
 * --out (or stdout). `--check` validates without writing. Exits 1 on any
 * problem. Diagnostics go to stderr and never include config values.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BundleError, bundleConfigs, type ConfigFile } from './bundle.js';

interface Args {
  dir: string;
  out?: string;
  check: boolean;
  printTokens: boolean;
  allowEmpty: boolean;
}

const USAGE = `Usage: bundle-configs --dir <path> [--out <file>] [--check] [--print-tokens] [--allow-empty]

  --dir <path>      Directory of per-person YAML configs (*.example.yaml skipped)
  --out <file>      Write the JSON bundle here (default: stdout)
  --check           Validate only; write nothing
  --print-tokens    Print one token per line to stdout (for CI masking)
  --allow-empty     Accept a directory with no configs
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: '', check: false, printTokens: false, allowEmpty: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--dir':
      case '--out': {
        const value = argv[++i];
        if (value === undefined) fail(`${flag} needs a value\n\n${USAGE}`);
        if (flag === '--dir') args.dir = value;
        else args.out = value;
        break;
      }
      case '--check':
        args.check = true;
        break;
      case '--print-tokens':
        args.printTokens = true;
        break;
      case '--allow-empty':
        args.allowEmpty = true;
        break;
      case '--':
        break;
      case '-h':
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      default:
        fail(`unknown argument: ${flag}\n\n${USAGE}`);
    }
  }
  if (args.dir === '') fail(`--dir is required\n\n${USAGE}`);
  return args;
}

function readConfigFiles(dir: string): ConfigFile[] {
  const root = resolve(dir);
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    fail(`cannot read directory: ${root}`);
  }
  return names
    .filter((name) => name.endsWith('.yaml') && !name.endsWith('.example.yaml'))
    .sort()
    .map((name) => ({
      file: `${basename(root)}/${name}`,
      source: readFileSync(join(root, name), 'utf-8'),
    }));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = readConfigFiles(args.dir);

  let result;
  try {
    result = bundleConfigs(files, { allowEmpty: args.allowEmpty });
  } catch (err) {
    if (err instanceof BundleError) fail(err.message);
    throw err;
  }

  if (args.printTokens) {
    process.stdout.write(result.tokens.map((t) => `${t}\n`).join(''));
  } else if (!args.check) {
    if (args.out === undefined) process.stdout.write(`${result.json}\n`);
    else writeFileSync(resolve(args.out), result.json, 'utf-8');
  }
  process.stderr.write(`OK: ${result.count} config(s) valid.\n`);
}

main();
