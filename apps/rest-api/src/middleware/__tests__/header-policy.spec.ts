import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHeaderPolicyMiddleware } from '../header-policy';
import { compileHeaderPolicy, type ResolvedHeaderPolicy } from '@kb-labs/plugin-adapter-rest';

describe('header-policy middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false }) as unknown as FastifyInstance;
    registerHeaderPolicyMiddleware(app);

    const policy: ResolvedHeaderPolicy = {
      defaults: 'deny',
      allowList: [],
      denyList: [],
      inbound: [
        {
          match: { kind: 'exact', name: 'x-api-key' },
          action: 'forward',
          required: true,
          transform: 'trim|lowercase',
        },
      ],
      outbound: [],
      security: undefined,
    };

    const compiled = compileHeaderPolicy(policy);

    app.get(
      '/secured',
      {
        config: {
          pluginId: 'test-plugin',
          pluginRouteId: 'GET /secured',
          kbHeaders: compiled,
        },
      },
      async (request, reply) => {
        const sanitizedHeaders = (request.headers as Record<string, string | undefined>)['x-api-key'];
        const state = (request as any).kbHeaderState;

        reply.send({
          sanitized: sanitizedHeaders,
          forwarded: state?.sanitized?.['x-api-key'],
          missingRequired: state?.validationErrors ?? 0,
        });
      }
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests missing required headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/secured',
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json() as Record<string, unknown>;
    expect(payload).toMatchObject({
      code: 'E_HEADER_REQUIRED',
    });
  });

  it('applies transform pipeline and forwards sanitized headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/secured',
      headers: {
        'x-api-key': '  SECRET-TOKEN  ',
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      sanitized: string;
      forwarded: string;
      missingRequired: number;
    };

    expect(payload.sanitized).toBe('secret-token');
    expect(payload.forwarded).toBe('secret-token');
    expect(payload.missingRequired).toBe(0);
  });
});


