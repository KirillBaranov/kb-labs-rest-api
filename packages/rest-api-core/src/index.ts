/**
 * @module @kb-labs/rest-api-core
 * KB Labs REST API Core - Business logic and adapters
 */

// Config
export { loadRestApiConfig } from './config/loader.js';
export { restApiConfigSchema, type RestApiConfig } from './config/schema.js';

// Contracts & DTOs
export * from './contracts/index.js';

// Ports
export type { CliPort, CliExecutionResult, CliExecutionOptions } from './ports/cli.js';
export type { StoragePort } from './ports/storage.js';
export type { QueuePort, JobMetadata, JobStatus as QueueJobStatus } from './ports/queue.js';
export type { AuthPort, UserContext, UserRole } from './ports/auth.js';

// Adapters
export * from './adapters/index.js';

// Utils
export * from './utils/errors.js';
export * from './utils/openapi.js';

// Services
export * from './services/index.js';

// Jobs
export * from './jobs/index.js';
