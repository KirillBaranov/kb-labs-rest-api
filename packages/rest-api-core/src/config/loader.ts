/**
 * @module @kb-labs/rest-api-core/config/loader
 * Configuration loader using loadBundle from @kb-labs/core-bundle
 */

import { loadBundle } from '@kb-labs/core-bundle';
import { resolveConfig, findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { restApiConfigSchema, type RestApiConfig } from './schema.js';

/**
 * Load REST API configuration
 */
export async function loadRestApiConfig(
  cwd: string = process.cwd(),
  cliOverrides?: Partial<RestApiConfig>
): Promise<{ config: RestApiConfig; diagnostics: Array<{ level: string; code: string; message: string }> }> {
  // Try to load bundle with 'restApi' product
  // Note: if 'restApi' is not registered as ProductId, we'll fall back to direct config loading
  let bundleConfig: any = {};
  
  try {
    const bundle = await loadBundle({
      cwd,
      product: 'restApi' as any, // TODO: Add 'restApi' to ProductId type
      profileKey: 'default',
    });
    bundleConfig = bundle.config;
  } catch (error) {
    // If bundle loading fails (product not registered), try direct config loading
    const { path: configPath } = await findNearestConfig({
      startDir: cwd,
      filenames: ['kb-labs.config.json', 'kb-labs.config.yaml'],
    });
    
    if (configPath) {
      const readResult = await readJsonWithDiagnostics<any>(configPath);
      if (readResult.ok && readResult.data?.rest) {
        bundleConfig = readResult.data.rest;
      }
    }
  }
  
  // Default configuration
  const defaults: RestApiConfig = {
    port: 3001,
    basePath: '/api/v1',
    apiVersion: '1.0.0',
    auth: {
      mode: 'none',
      apiKeyHeader: 'X-API-Key',
      roles: ['viewer', 'operator', 'admin'],
    },
    queue: {
      driver: 'memory',
      maxConcurrent: {
        audit: 2,
        release: 1,
        devlink: 2,
      },
      defaultPriority: 0,
    },
    cli: {
      bin: 'pnpm',
      prefix: ['kb'],
      timeoutSec: 900,
      allowedCommands: ['audit', 'release', 'devlink', 'mind', 'analytics'],
    },
    storage: {
      driver: 'fs',
      baseDir: '.kb/rest',
    },
    plugins: [],
    mockMode: false,
    cors: {
      origins: ['http://localhost:3000'],
      allowCredentials: true,
    },
  };
  
  // Environment mapper: KB_REST_* env vars
  const envMapper = (env: NodeJS.ProcessEnv): Partial<RestApiConfig> => {
    const overrides: Partial<RestApiConfig> = {};
    
    if (env.KB_REST_PORT) {
      overrides.port = parseInt(env.KB_REST_PORT, 10);
    }
    if (env.KB_REST_BASE_PATH) {
      overrides.basePath = env.KB_REST_BASE_PATH;
    }
    if (env.KB_REST_AUTH_MODE) {
      overrides.auth = { 
        ...defaults.auth, 
        mode: env.KB_REST_AUTH_MODE as any,
        apiKeyHeader: defaults.auth.apiKeyHeader || 'X-API-Key',
      };
    }
    if (env.KB_REST_QUEUE_DRIVER) {
      overrides.queue = { ...defaults.queue, driver: env.KB_REST_QUEUE_DRIVER as any };
    }
    if (env.KB_REST_STORAGE_DRIVER) {
      overrides.storage = { ...defaults.storage, driver: env.KB_REST_STORAGE_DRIVER as any };
    }
    if (env.KB_REST_MOCK_MODE === 'true' || env.KB_REST_MOCK_MODE === '1') {
      overrides.mockMode = true;
    }
    
    return overrides;
  };
  
  // Resolve configuration: defaults → bundleConfig → env → cliOverrides
  const resolved = resolveConfig<RestApiConfig>({
    defaults,
    fileConfig: bundleConfig,
    envMapper,
    cliOverrides,
    validate: (cfg) => {
      const result = restApiConfigSchema.safeParse(cfg);
      if (result.success) {
        return { ok: true };
      }
      return {
        ok: false,
        diagnostics: result.error.errors.map((err) => ({
          level: 'error' as const,
          code: 'CONFIG_VALIDATION_ERROR',
          message: `${err.path.join('.')}: ${err.message}`,
        })),
      };
    },
  });
  
  // Parse with Zod to get properly typed config
  const validated = restApiConfigSchema.parse(resolved.value);
  
  return {
    config: validated,
    diagnostics: resolved.diagnostics,
  };
}

