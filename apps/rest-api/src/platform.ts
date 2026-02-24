/**
 * @module @kb-labs/rest-api-app/platform
 *
 * Platform services provider for REST API.
 * Uses core-runtime to initialize real adapters from kb.config.json.
 */

import type { PlatformServices } from '@kb-labs/plugin-contracts';
import {
  initPlatform,
  platform,
  type PlatformConfig,
  type PlatformLifecycleContext,
  type PlatformLifecycleHooks,
  type PlatformLifecyclePhase,
} from '@kb-labs/core-runtime';
import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';

/**
 * Whether platform has been initialized.
 */
let _initialized = false;
const REST_LIFECYCLE_HOOK_ID = 'rest-api';
let _hooksRegistered = false;

function ensureLifecycleHooksRegistered(): void {
  if (_hooksRegistered) {
    return;
  }

  const hooks: PlatformLifecycleHooks = {
    onStart: (ctx: PlatformLifecycleContext) => {
      console.log('[platform] lifecycle:start', {
        app: 'rest',
        cwd: ctx.cwd,
        isChildProcess: ctx.isChildProcess,
      });
    },
    onReady: (ctx: PlatformLifecycleContext) => {
      platform.logger.info('Platform lifecycle ready', {
        app: 'rest',
        durationMs: ctx.metadata?.durationMs,
      });
    },
    onShutdown: () => {
      platform.logger.info('Platform lifecycle shutdown', { app: 'rest' });
    },
    onError: (error: unknown, phase: PlatformLifecyclePhase) => {
      console.warn('[platform] lifecycle:error', {
        app: 'rest',
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };

  platform.registerLifecycleHooks(REST_LIFECYCLE_HOOK_ID, hooks);
  _hooksRegistered = true;
}

/**
 * Initialize platform from kb.config.json.
 * Loads real adapters (LLM, embeddings, vector store, etc.) from config.
 * Falls back to NoOp adapters if config not found or missing.
 *
 * @param cwd - Workspace root directory to search for kb.config.json
 */
export async function initializePlatform(cwd: string = process.cwd()): Promise<void> {
  ensureLifecycleHooksRegistered();

  if (_initialized) {
    // Can't use platform.logger yet - not initialized
    console.log('[platform] Already initialized, skipping');
    return;
  }

  try {
    // Try to find kb.config.json
    const { path: configPath } = await findNearestConfig({
      startDir: cwd,
      filenames: [
        '.kb/kb.config.json',
        'kb.config.json',
      ],
    });

    if (!configPath) {
      console.log('[platform] No kb.config.json found, using NoOp adapters');
      await initPlatform({ adapters: {} }, cwd);
      _initialized = true;
      return;
    }

    // Read config
    const result = await readJsonWithDiagnostics<{ platform?: PlatformConfig }>(configPath);
    if (!result.ok) {
      console.warn('[platform] Failed to read kb.config.json, using NoOp adapters', {
        errors: result.diagnostics.map(d => d.message),
      });
      await initPlatform({ adapters: {} }, cwd);
      _initialized = true;
      return;
    }

    // Extract platform config
    const platformConfig = result.data.platform;
    if (!platformConfig) {
      console.log('[platform] No platform config in kb.config.json, using NoOp adapters');
      await initPlatform({ adapters: {} }, cwd);
      _initialized = true;
      return;
    }

    // Initialize platform with config
    console.log('[platform] Initializing platform adapters', {
      configPath,
      adapters: Object.keys(platformConfig.adapters ?? {}),
    });

    await initPlatform(platformConfig, cwd);
    _initialized = true;

    // Now we can use platform.logger (initialized)
    platform.logger.info('Platform adapters initialized', {
      adapters: Object.keys(platformConfig.adapters ?? {}),
      hasExecutionBackend: !!platform.executionBackend,
    });

  } catch (error) {
    console.warn('[platform] Platform initialization failed, using NoOp adapters', {
      error: error instanceof Error ? error.message : String(error),
    });
    await initPlatform({ adapters: {} }, cwd);
    _initialized = true;
  }
}

/**
 * Get platform services instance.
 * Returns the core-runtime platform singleton which implements all adapter interfaces.
 *
 * NOTE: Call initializePlatform() before using this to get real adapters.
 * If not initialized, returns noop/mock fallbacks from the platform singleton.
 */
export function getPlatformServices(): PlatformServices {
  return {
    logger: platform.logger,
    llm: platform.llm,
    embeddings: platform.embeddings,
    vectorStore: platform.vectorStore,
    cache: platform.cache,
    storage: platform.storage,
    analytics: platform.analytics,
    eventBus: platform.eventBus,
  };
}
