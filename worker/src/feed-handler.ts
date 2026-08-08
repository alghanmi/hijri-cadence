import { validateConfig } from './config.js';
import { generateIcs } from './ics.js';
import { generateOccurrences } from './occurrences.js';
import type { Logger } from './logger.js';
import type { RawConfig } from './types.js';

const FEED_PATH_RE = /^\/feed\/([A-Za-z0-9]{8,})\.ics$/;

/**
 * `CONFIGS_JSON` is a build-time `--define` substitution baked into the
 * bundle by wrangler at deploy time (see globals.d.ts). Parsed once at
 * cold start; every request reads from the resulting Map.
 *
 * Tests + `wrangler dev` see the default empty object from wrangler.toml
 * — the feed handler returns 404 for every token until a real deploy
 * runs.
 */
const CONFIGS = parseConfigs();

function parseConfigs(): Map<string, RawConfig> {
  try {
    const parsed: unknown = JSON.parse(CONFIGS_JSON);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new Map();
    }
    return new Map(Object.entries(parsed as Record<string, RawConfig>));
  } catch {
    return new Map();
  }
}

export interface FeedHandlerDeps {
  logger: Logger;
  now?: () => Date;
}

/**
 * Handle `GET /feed/<token>.ics`. Returns 404 for anything else so the
 * Worker doesn't reveal its shape to unauthenticated probes.
 */
export async function handleFeed(request: Request, deps: FeedHandlerDeps): Promise<Response> {
  const url = new URL(request.url);
  const match = FEED_PATH_RE.exec(url.pathname);
  if (match === null || request.method !== 'GET') {
    return new Response('not found', { status: 404 });
  }

  const token = match[1];
  if (token === undefined) return new Response('not found', { status: 404 });
  const tokenHash = await hashToken(token);

  const raw = CONFIGS.get(token);
  if (raw === undefined) {
    deps.logger.info('feed.miss', { tokenHash });
    return new Response('not found', { status: 404 });
  }

  let config;
  try {
    config = validateConfig(raw);
  } catch (err) {
    deps.logger.error('feed.config_invalid', {
      tokenHash,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response('internal error', { status: 500 });
  }

  const now = (deps.now ?? (() => new Date()))();
  const occurrences = generateOccurrences(config, now);
  const ics = generateIcs(occurrences, { feedId: tokenHash.slice(0, 12), now });

  deps.logger.info('feed.served', {
    tokenHash,
    occurrenceCount: occurrences.length,
    calendar: config.calendar,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      // Google Calendar polls webcal feeds every 12-24h; the Worker
      // regenerates from config on every request so a short cache is
      // safe and useful for retries.
      'cache-control': 'public, max-age=300',
      'content-disposition': 'inline; filename="hijri-cadence.ics"',
    },
  });
}

/** SHA-256 hex of a token; used in logs so raw tokens never appear. */
async function hashToken(token: string): Promise<string> {
  const buf = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
