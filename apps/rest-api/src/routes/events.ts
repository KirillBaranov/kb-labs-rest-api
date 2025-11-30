import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI, SystemHealthSnapshot } from '@kb-labs/cli-api';
import type { ReadinessState } from './readiness';
import { isReady, resolveReadinessReason } from './readiness';
import type { EventHub, BroadcastEvent } from '../events/hub';
import { metricsCollector } from '../middleware/metrics';
import { buildRegistrySseAuthHook } from '../utils/sse-auth';

export async function registerEventRoutes(
  server: FastifyInstance,
  basePath: string,
  cliApi: CliAPI,
  readiness: ReadinessState,
  eventHub: EventHub,
  config: RestApiConfig
): Promise<void> {
  const endpoint = `${basePath}/events/registry`;
  const authHook = buildRegistrySseAuthHook(config);

  server.route({
    method: 'GET',
    url: endpoint,
    onRequest: authHook ? [authHook] : undefined,
    handler: async (request, reply) => {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders?.();
      reply.raw.write(': connected\n\n');

      const send = (event: BroadcastEvent) => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = eventHub.subscribe(send);

      const snapshot = cliApi.snapshot();
      const checksumAlgorithm = snapshot.checksumAlgorithm === 'sha256' ? 'sha256' : undefined;
      send({
        type: 'registry',
        rev: snapshot.rev,
        generatedAt: snapshot.generatedAt,
        partial: snapshot.partial,
        stale: snapshot.stale,
        expiresAt: snapshot.expiresAt ?? null,
        ttlMs: snapshot.ttlMs ?? null,
        checksum: snapshot.checksum ?? undefined,
        checksumAlgorithm,
        previousChecksum: snapshot.previousChecksum ?? null,
      });

      void cliApi
        .getSystemHealth()
        .then((health: SystemHealthSnapshot) => {
          const ready = isReady(readiness);
          const reason = resolveReadinessReason(readiness);
          const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();
          const redisStatus = cliApi.getRedisStatus?.();
          send({
            type: 'health',
            status: health.status,
            ts: health.ts,
            ready,
            reason,
            registryPartial: readiness.registryPartial,
            registryStale: readiness.registryStale,
            registryLoaded: readiness.registryLoaded,
            pluginMountInProgress: readiness.pluginMountInProgress,
            pluginRoutesMounted: readiness.pluginRoutesMounted,
            pluginsMounted: pluginSnapshot?.succeeded ?? 0,
            pluginsFailed: pluginSnapshot?.failed ?? 0,
            lastPluginMountTs: readiness.lastPluginMountTs ?? null,
            pluginRoutesLastDurationMs: readiness.pluginRoutesLastDurationMs ?? null,
            redisEnabled: redisStatus?.enabled ?? false,
            redisHealthy: redisStatus?.healthy ?? true,
            redisStates: redisStatus?.roles,
          });
        })
        .catch((error: unknown) => {
          request.log.warn({ err: error }, 'Failed to fetch system health for SSE client');
        });

      request.raw.on('close', () => {
        unsubscribe();
        reply.raw.end();
      });

      await new Promise<void>(() => {});
    },
  });
}
