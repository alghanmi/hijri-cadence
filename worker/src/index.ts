// Provider self-registration side-effect — importing this module registers
// the umm_al_qura provider in the registry. Any additional providers should
// be imported here for the same reason.
import './providers/umm-al-qura.js';

import { handleFeed } from './feed-handler.js';
import { scheduledHealthcheck } from './healthcheck.js';
import { createLogger, parseLogLevel } from './logger.js';
import type { Env } from './types.js';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger(parseLogLevel(env.LOG_LEVEL), env.INSTANCE_ID);
    return handleFeed(request, { logger });
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(parseLogLevel(env.LOG_LEVEL), env.INSTANCE_ID);
    await scheduledHealthcheck(logger, env.HEARTBEAT_URL);
  },
} satisfies ExportedHandler<Env>;
