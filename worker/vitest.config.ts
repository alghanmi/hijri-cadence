import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    // Tier 3 network-dependent spot-checks live under test/spot-check/ and
    // are invoked explicitly via `pnpm spot-check`. Never part of `pnpm test`.
    exclude: ['**/node_modules/**', '**/spot-check/**'],
  },
});
