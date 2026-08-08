#!/usr/bin/env tsx
/**
 * Local ICS generation entry point.
 *
 * Reads a YAML config file and writes an .ics to disk — no Worker, no
 * network, no deploy. Same `occurrences.ts` + `ics.ts` code as the
 * production feed handler.
 *
 * Usage:
 *   pnpm --filter @hijri-cadence/worker generate:local \
 *     -- --config ../examples/events.example.yaml --out /tmp/out.ics
 *
 * Or via the deploy repo's Makefile:
 *   make ical-local CONFIG=examples/events.example.yaml OUT=out.ics
 */

// Provider self-registration
import './providers/umm-al-qura.js';

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseConfig } from './config.js';
import { generateIcs } from './ics.js';
import { generateOccurrences } from './occurrences.js';

interface CliArgs {
  config: string;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--config' && value !== undefined) {
      args.config = value;
      i++;
    } else if (flag === '--out' && value !== undefined) {
      args.out = value;
      i++;
    } else if (flag === '-h' || flag === '--help') {
      printHelpAndExit(0);
    }
  }
  if (args.config === undefined || args.out === undefined) {
    printHelpAndExit(1);
  }
  return args as CliArgs;
}

function printHelpAndExit(code: number): never {
  const msg = `Usage: generate:local --config <path> --out <path>

Options:
  --config <path>   YAML config file to read (see examples/events.example.yaml)
  --out    <path>   Destination path for the generated .ics file
  -h, --help        Show this help

Example:
  pnpm --filter @hijri-cadence/worker generate:local -- \\
    --config examples/events.example.yaml --out /tmp/out.ics
`;
  process.stderr.write(msg);
  process.exit(code);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolve(args.config);
  const outPath = resolve(args.out);

  const source = readFileSync(configPath, 'utf-8');
  const config = parseConfig(source);
  const occurrences = generateOccurrences(config);
  const ics = generateIcs(occurrences, { calendarName: 'Hijri Cadence (local)' });

  writeFileSync(outPath, ics, 'utf-8');
  process.stderr.write(`Wrote ${occurrences.length} occurrences → ${outPath}\n`);
}

main();
