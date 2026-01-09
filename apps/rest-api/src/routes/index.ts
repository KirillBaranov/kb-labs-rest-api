/**
 * @module @kb-labs/rest-api-app/routes
 * Route registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI, RedisStatus } from '@kb-labs/cli-api';
import { EventHub } from '../events/hub';
import { registerEventRoutes } from './events';
import { registerHealthRoutes } from './health';
import { registerOpenAPIRoutes } from './openapi';
import { registerMetricsRoutes } from './metrics';
import { registerPluginRoutes, registerPluginRegistry } from './plugins';
import { registerWorkflowRoutes } from './workflows';
import { registerWorkflowManagementRoutes } from './workflow-management';
import { registerCacheRoutes } from './cache';
import { registerObservabilityRoutes } from './observability';
import { registerAnalyticsRoutes } from './analytics';
import { registerAdaptersRoutes } from './adapters';
import { registerLogRoutes } from './logs';
import { registerPlatformRoutes } from './platform';
import { registerDebugRoutes, registerRouteCollector } from './debug-routes';
import type { ReadinessState } from './readiness';
import { isReady, resolveReadinessReason } from './readiness';
import { metricsCollector } from '../middleware/metrics';
import { getPlatformServices } from '../platform';
import { HistoricalMetricsCollector } from '../services/historical-metrics';
import { IncidentStorage } from '../services/incident-storage';
import { IncidentDetector } from '../services/incident-detector';

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
  // Register route collector hook FIRST, before any routes are registered
  // This allows us to collect all routes for the /routes endpoint
  registerRouteCollector(server);

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

  const handleRedisUpdate = (status: RedisStatus) => {
    metricsCollector.recordRedisStatus(status);
    if (!readiness.redisEnabled && status.enabled) {
      server.log.info({ redis: status }, 'Redis support enabled');
    }
    if (readiness.redisConnected !== status.healthy) {
      const level = status.healthy ? 'info' : 'warn';
      server.log[level]({ redis: status }, 'Redis health status changed');
    }
    const prevStates = readiness.redisStates;
    if (
      prevStates.publisher !== (status.roles.publisher ?? null) ||
      prevStates.subscriber !== (status.roles.subscriber ?? null) ||
      prevStates.cache !== (status.roles.cache ?? null)
    ) {
      server.log.info({ redis: status.roles }, 'Redis role state changed');
    }
  };

  if (initialRedisStatus) {
    handleRedisUpdate(initialRedisStatus);
  }
  server.kbReadiness = readiness;

  const eventHub = server.kbEventHub ?? new EventHub();
  server.kbEventHub = eventHub;

  const broadcastState = async (): Promise<void> => {
    const pluginsSnapshot = metricsCollector.getLastPluginMountSnapshot();
    const redisStatus = cliApi.getRedisStatus?.();
    if (redisStatus) {
      handleRedisUpdate(redisStatus);
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

  // Initial mount - wait for completion before server starts listening
  server.log.info('Starting initial plugin route mounting');
  try {
    await runMount();
    server.log.info('Plugin route mounting completed');
  } catch (error) {
    server.log.error(
      { err: error },
      'Plugin route mounting failed'
    );
  }

  // Create a resolved promise for initial mount (already completed)
  let mountPromise = Promise.resolve();

  const scheduleRemount = (): void => {
    // Check if server is already listening - Fastify doesn't allow adding routes after listen()
    // Check both Fastify's listening property and underlying Node.js server
    const isListening = (server as any).listening || 
                       (server.server && (server.server as any).listening);
    
    if (isListening) {
      server.log.warn(
        'Cannot remount plugin routes: server is already listening. Restart required.'
      );
      return;
    }

    readiness.pluginMountInProgress = true;
    mountPromise = mountPromise
      .catch(() => void 0)
      .then(async () => {
        // Double-check server is not listening before remount
        const stillListening = (server as any).listening || 
                               (server.server && (server.server as any).listening);
        
        if (stillListening) {
          server.log.warn(
            'Cannot remount plugin routes: server started listening during remount. Restart required.'
          );
          return;
        }
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

  await registerWorkflowRoutes(server, config, cliApi);

  // Register workflow management endpoints (new endpoints for CRUD and scheduling)
  const platform = getPlatformServices();
  await registerWorkflowManagementRoutes(server, config, cliApi, platform);

  await registerCacheRoutes(server, config, cliApi);

  // Initialize historical metrics collector
  const historicalCollector = new HistoricalMetricsCollector(
    platform.cache,
    {
      intervalMs: 5000, // Collect every 5 seconds
      debug: process.env.NODE_ENV !== 'production',
    },
    server.log
  );

  // Start background collection
  historicalCollector.start();
  server.log.info('Historical metrics collector started');

  // Stop collector on server close
  server.addHook('onClose', async () => {
    historicalCollector.stop();
    server.log.info('Historical metrics collector stopped');
  });

  // Initialize incident storage
  const incidentStorage = new IncidentStorage(
    platform.cache,
    {
      ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxIncidents: 1000,
      debug: process.env.NODE_ENV !== 'production',
    },
    server.log
  );
  server.log.info('Incident storage initialized');

  // Initialize incident detector for auto-detection
  const incidentDetector = new IncidentDetector(
    incidentStorage,
    {
      intervalMs: 30000, // Check every 30 seconds
      cooldownMs: 5 * 60 * 1000, // 5 minute cooldown between same incidents
      debug: process.env.NODE_ENV !== 'production',
      thresholds: {
        errorRateWarning: 5,
        errorRateCritical: 10,
        latencyP99Warning: 2000,
        latencyP99Critical: 5000,
        latencyP95Warning: 1000,
        minRequestsForDetection: 10,
        pluginErrorRateWarning: 10,
        pluginErrorRateCritical: 25,
      },
    },
    server.log
  );

  // Start incident detector
  incidentDetector.start();
  server.log.info('Incident detector started');

  // Stop detector on server close
  server.addHook('onClose', async () => {
    incidentDetector.stop();
    server.log.info('Incident detector stopped');
  });

  await registerObservabilityRoutes(server, config, repoRoot, historicalCollector, incidentStorage, platform);

  await registerAnalyticsRoutes(server, config);

  await registerAdaptersRoutes(server, config);

  await registerLogRoutes(server, config, eventHub);

  await registerPlatformRoutes(server, config, repoRoot);

  await registerDebugRoutes(server, config);

  await registerEventRoutes(server, basePath, cliApi, readiness, eventHub, config);
}

