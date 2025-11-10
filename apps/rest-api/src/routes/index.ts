/**
 * @module @kb-labs/rest-api-app/routes
 * Route registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { EventHub } from '../events/hub.js';
import { registerEventRoutes } from './events.js';
import { registerHealthRoutes } from './health.js';
import { registerOpenAPIRoutes } from './openapi.js';
import { registerMetricsRoutes } from './metrics.js';
import { registerPluginRoutes, registerPluginRegistry } from './plugins.js';
import type { ReadinessState } from './readiness.js';
import { isReady, resolveReadinessReason } from './readiness.js';
import { metricsCollector } from '../middleware/metrics.js';

function normalizeBasePath(basePath?: string): string {
  if (!basePath || basePath === '/') {
    return '';
  }
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
}

/**
 * Register all routes
 */
export async function registerRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
): Promise<void> {
  const initialSnapshot = cliApi.snapshot();
  const initialRedisStatus = cliApi.getRedisStatus?.();
  const initialRedisStates = initialRedisStatus?.roles ?? {
    publisher: null,
    subscriber: null,
    cache: null,
  };
  const registryLoaded =
    initialSnapshot.plugins.length > 0 && !initialSnapshot.partial && !initialSnapshot.stale;

  const readiness: ReadinessState = {
    cliApiInitialized: true,
    registryLoaded,
    registryPartial: initialSnapshot.partial,
    registryStale: initialSnapshot.stale,
    pluginRoutesMounted: false,
     pluginMountInProgress: true,
    pluginRoutesCount: 0,
    pluginRouteErrors: 0,
    pluginRouteFailures: [],
    lastPluginMountTs: null,
    pluginRoutesLastDurationMs: null,
    redisEnabled: initialRedisStatus?.enabled ?? false,
    redisConnected: initialRedisStatus?.healthy ?? true,
    redisStates: initialRedisStates,
  };

  server.kbReadiness = readiness;

  const eventHub = server.kbEventHub ?? new EventHub();
  server.kbEventHub = eventHub;

  const broadcastState = async (): Promise<void> => {
    const pluginsSnapshot = metricsCollector.getLastPluginMountSnapshot();
    const redisStatus = cliApi.getRedisStatus?.();
    if (redisStatus) {
      readiness.redisEnabled = redisStatus.enabled;
      readiness.redisConnected = redisStatus.healthy;
      readiness.redisStates = {
        publisher: redisStatus.roles.publisher ?? null,
        subscriber: redisStatus.roles.subscriber ?? null,
        cache: redisStatus.roles.cache ?? null,
      };
    }
    try {
      const snapshot = cliApi.snapshot();
      eventHub.publish({
        type: 'registry',
        rev: snapshot.rev,
        generatedAt: snapshot.generatedAt,
        partial: snapshot.partial,
        stale: snapshot.stale,
        expiresAt: snapshot.expiresAt ?? null,
        ttlMs: snapshot.ttlMs ?? null,
        checksum: snapshot.checksum ?? undefined,
        checksumAlgorithm: snapshot.checksumAlgorithm,
        previousChecksum: snapshot.previousChecksum ?? null,
      });
    } catch (error) {
      server.log.warn({ err: error }, 'Failed to publish registry snapshot event');
    }

    try {
      const health = await cliApi.getSystemHealth();
      const ready = isReady(readiness);
      const reason = resolveReadinessReason(readiness);
      eventHub.publish({
        type: 'health',
        status: health.status,
        ts: health.ts,
        ready,
        reason,
        registryPartial: readiness.registryPartial,
        registryStale: readiness.registryStale,
        registryLoaded: readiness.registryLoaded,
        pluginsMounted: pluginsSnapshot?.succeeded ?? 0,
        pluginsFailed: pluginsSnapshot?.failed ?? 0,
        pluginMountInProgress: readiness.pluginMountInProgress,
        pluginRoutesMounted: readiness.pluginRoutesMounted,
        lastPluginMountTs: readiness.lastPluginMountTs ?? null,
        pluginRoutesLastDurationMs: readiness.pluginRoutesLastDurationMs ?? null,
        redisEnabled: readiness.redisEnabled,
        redisHealthy: readiness.redisConnected,
        redisStates: readiness.redisStates,
      });
    } catch (error) {
      server.log.warn({ err: error }, 'Failed to publish health event');
    }
  };

  await broadcastState();

  const runMount = async (): Promise<void> => {
    try {
      await registerPluginRoutes(server, config, repoRoot, cliApi, readiness);
    } finally {
      await broadcastState();
    }
  };

  let mountPromise = runMount()
    .then(() => {
      server.log.info('Plugin route mounting completed');
    })
    .catch(error => {
      server.log.error(
        { err: error },
        'Plugin route mounting failed'
      );
    });

  (server as any).kbPluginMountPromise = mountPromise;

  const scheduleRemount = (): void => {
    readiness.pluginMountInProgress = true;
    mountPromise = mountPromise
      .catch(() => void 0)
      .then(async () => {
        server.log.info('Registry change detected, remounting plugin routes');
        await runMount();
      })
      .then(() => {
        server.log.info('Plugin route remount completed');
      })
      .catch(error => {
        server.log.error(
          { err: error },
          'Plugin route remount failed'
        );
      });

    (server as any).kbPluginMountPromise = mountPromise;
  };

  cliApi.onChange(() => {
    scheduleRemount();
  });

  const basePath = normalizeBasePath(config.basePath);

  await registerHealthRoutes(server, config, repoRoot, cliApi, readiness);

  await registerOpenAPIRoutes(server, config, repoRoot, cliApi);

  registerMetricsRoutes(server, config);

  await registerPluginRegistry(server, config, cliApi);

  await registerEventRoutes(server, basePath, cliApi, readiness, eventHub, config);
}

