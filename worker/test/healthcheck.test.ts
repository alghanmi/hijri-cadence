import '../src/providers/umm-al-qura.js';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduledHealthcheck } from '../src/healthcheck.js';
import type { Logger } from '../src/logger.js';
import { ummAlQuraProvider } from '../src/providers/umm-al-qura.js';

function makeLogger(): Logger & { errors: string[] } {
  const errors: string[] = [];
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: (event) => errors.push(event), errors };
}

describe('scheduledHealthcheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pings the heartbeat URL when the self-check passes', async () => {
    const fetchMock = vi.fn(async () => new Response('OK'));
    vi.stubGlobal('fetch', fetchMock);
    await scheduledHealthcheck(makeLogger(), 'https://hc.example/abc');
    expect(fetchMock).toHaveBeenCalledWith('https://hc.example/abc', { method: 'POST' });
  });

  it('pings /fail when the provider throws', async () => {
    const fetchMock = vi.fn(async () => new Response('OK'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(ummAlQuraProvider, 'toGregorian').mockImplementation(() => {
      throw new Error('boom');
    });
    const logger = makeLogger();
    await scheduledHealthcheck(logger, 'https://hc.example/abc');
    expect(logger.errors).toContain('healthcheck.error');
    expect(fetchMock).toHaveBeenCalledWith('https://hc.example/abc/fail', { method: 'POST' });
  });
});
