/**
 * @module @kb-labs/rest-api-app/types/fastify
 * Fastify type extensions
 */

import type { FastifyBaseLogger } from 'fastify/types/logger';
import type { FastifySchema } from 'fastify/types/schema';
import type { FastifyTypeProvider, FastifyTypeProviderDefault } from 'fastify/types/type-provider';
import type { ContextConfigDefault, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault } from 'fastify/types/utils';

declare module 'fastify/types/instance' {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    SchemaCompiler extends FastifySchema = FastifySchema,
    ContextConfig = ContextConfigDefault
  > {
    rateLimit?: unknown;
  }
}

declare module 'fastify/types/request' {
  interface FastifyRequest {
    mockMode?: boolean;
  }
}
