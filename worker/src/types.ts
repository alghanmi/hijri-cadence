export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Runtime env bindings — mirrors Terraform's plain_text bindings on the
 * Worker script resource.
 */
export interface Env {
  INSTANCE_ID: string;
  LOG_LEVEL: string;
  HEARTBEAT_URL?: string;
}

/**
 * Raw config shape as it appears in each per-token entry of CONFIGS_JSON,
 * pre-validation. `validateConfig` in config.ts returns the typed form.
 */
export type RawConfig = unknown;
