import { describe, expect, it } from 'vitest';
import { handleFeed } from '../src/feed-handler.js';
import type { Logger } from '../src/logger.js';

const noop = (): void => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const configs = new Map<string, unknown>([
  [
    TOKEN,
    {
      calendar: 'umm_al_qura',
      events: [{ name: 'A', hijri_day: 1, hijri_month: 1, reminder_days_before: [] }],
    },
  ],
]);
const deps = { logger, configs, now: () => new Date(Date.UTC(2025, 0, 1)) };

function req(path: string, method = 'GET'): Request {
  return new Request(`https://example.test${path}`, { method });
}

describe('handleFeed', () => {
  it('serves the ICS for a known token', async () => {
    const res = await handleFeed(req(`/feed/${TOKEN}.ics`), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
  });

  it('answers HEAD with 200 headers and no body', async () => {
    const res = await handleFeed(req(`/feed/${TOKEN}.ics`, 'HEAD'), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it.each([
    ['unknown token', `/feed/${'Z'.repeat(22)}.ics`, 'GET'],
    ['short token', '/feed/abcdefgh.ics', 'GET'],
    ['token with hyphen', `/feed/${TOKEN}-x.ics`, 'GET'],
    ['other path', '/', 'GET'],
    ['POST', `/feed/${TOKEN}.ics`, 'POST'],
    ['HEAD unknown', `/feed/${'Z'.repeat(22)}.ics`, 'HEAD'],
  ])('returns 404 for %s', async (_label, path, method) => {
    const res = await handleFeed(req(path, method), deps);
    expect(res.status).toBe(404);
  });
});
