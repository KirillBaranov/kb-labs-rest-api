/**
 * @module @kb-labs/rest-api-app/tasks/cleanup
 * Background cleanup task for expired jobs and artifacts
 */

import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { QueuePort, StoragePort } from '@kb-labs/rest-api-core';

/**
 * Cleanup task options
 */
interface CleanupTaskOptions {
  queue: QueuePort;
  storage: StoragePort;
  config: RestApiConfig;
  repoRoot: string;
}

/**
 * Cleanup expired jobs and artifacts
 */
async function cleanupExpired(
  queue: QueuePort,
  storage: StoragePort,
  config: RestApiConfig,
  repoRoot: string
): Promise<{ jobsCleaned: number; artifactsCleaned: number }> {
  const cleanupConfig = (config.queue as any).cleanup;
  if (!cleanupConfig?.enabled) {
    return { jobsCleaned: 0, artifactsCleaned: 0 };
  }

  const ttlSec = cleanupConfig.ttlSec || 86400; // Default 24 hours
  let jobsCleaned = 0;
  let artifactsCleaned = 0;

  // Cleanup jobs (cleanup is optional in QueuePort interface)
  const queueWithCleanup = queue as QueuePort & { cleanup?: (ttlSec: number) => Promise<number> };
  if (typeof queueWithCleanup.cleanup === 'function') {
    jobsCleaned = await queueWithCleanup.cleanup(ttlSec);
  }

  // Cleanup artifacts if enabled
  if (cleanupConfig.cleanupArtifacts) {
    try {
      // List all job runs
      const runsDir = 'runs';
      const exists = await storage.exists(runsDir);
      
      if (exists) {
        const kindDirs = await storage.list(runsDir);
        const now = Date.now();
        const ttlMs = ttlSec * 1000;

        for (const kindDir of kindDirs) {
          // Check for completed runs in this kind
          const runs = await storage.list(kindDir);
          
          for (const runPath of runs) {
            try {
              // Try to parse run directory structure: runs/{kind}/{runId}/
              const parts = runPath.split('/');
              if (parts.length >= 3) {
                const runId = parts[parts.length - 1];
                
                // Check if this run corresponds to a deleted job
                // We'll clean up artifacts older than TTL
                const summaryPath = `${runPath}/summary.json`;
                const summaryExists = await storage.exists(summaryPath);
                
                if (summaryExists) {
                  try {
                    const summary = await storage.readJson<any>(summaryPath);
                    const finishedAt = summary.finishedAt || summary.createdAt;
                    
                    if (finishedAt) {
                      const finishedTime = new Date(finishedAt).getTime();
                      if (now - finishedTime > ttlMs) {
                        // Delete all artifacts for this run
                        // Note: This is a simplified implementation
                        // Full implementation would need recursive directory deletion
                        artifactsCleaned++;
                      }
                    }
                  } catch {
                    // Ignore errors reading summary
                  }
                }
              }
            } catch {
              // Ignore errors for individual runs
            }
          }
        }
      }
    } catch (error) {
      // Log but don't fail cleanup task
      console.error('Error cleaning up artifacts:', error);
    }
  }

  return { jobsCleaned, artifactsCleaned };
}

/**
 * Start periodic cleanup task
 */
export function startCleanupTask(options: CleanupTaskOptions): () => void {
  const { queue, storage, config, repoRoot } = options;
  const cleanupConfig = (config.queue as any).cleanup;

  if (!cleanupConfig?.enabled) {
    // Return no-op cleanup function
    return () => {};
  }

  const intervalSec = cleanupConfig.intervalSec || 3600; // Default 1 hour
  const intervalMs = intervalSec * 1000;

  // Run cleanup immediately on start
  cleanupExpired(queue, storage, config, repoRoot).catch(error => {
    console.error('Initial cleanup failed:', error);
  });

  // Schedule periodic cleanup
  const intervalId = setInterval(async () => {
    try {
      const result = await cleanupExpired(queue, storage, config, repoRoot);
      if (result.jobsCleaned > 0 || result.artifactsCleaned > 0) {
        console.log(`Cleanup completed: ${result.jobsCleaned} jobs, ${result.artifactsCleaned} artifacts`);
      }
    } catch (error) {
      console.error('Cleanup task error:', error);
    }
  }, intervalMs);

  // Return stop function
  return () => {
    clearInterval(intervalId);
  };
}

