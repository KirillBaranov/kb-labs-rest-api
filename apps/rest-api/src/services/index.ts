/**
 * @module @kb-labs/rest-api-app/services
 * Service factory
 */

import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  ExecaCliAdapter,
  FsStorageAdapter,
  MemoryQueueAdapter,
  NoneAuthAdapter,
  AuditService,
  ReleaseService,
  DevlinkService,
  MindService,
  AnalyticsService,
} from '@kb-labs/rest-api-core';

/**
 * Create all services
 */
export function createServices(config: RestApiConfig, repoRoot: string) {
  // Create adapters
  const cli = new ExecaCliAdapter(config, repoRoot);
  const storage = new FsStorageAdapter(config, repoRoot);
  const queue = new MemoryQueueAdapter(config);
  const auth = new NoneAuthAdapter(config);

  // Set CLI adapter reference in queue for cancellation support
  (queue as any).setCliAdapter(cli);

  // Create services
  const audit = new AuditService(cli, storage, queue, config, repoRoot);
  const release = new ReleaseService(cli, storage, queue, config, repoRoot);
  const devlink = new DevlinkService(cli, storage, queue, config, repoRoot);
  const mind = new MindService(storage, config, repoRoot);
  const analytics = new AnalyticsService(storage, config, repoRoot);

  return {
    cli,
    storage,
    queue,
    auth,
    audit,
    release,
    devlink,
    mind,
    analytics,
  };
}
