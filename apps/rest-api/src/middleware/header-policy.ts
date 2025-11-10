/**
 * @module @kb-labs/rest-api-app/middleware/header-policy
 * Enforce manifest-declared header policies for plugin routes.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CompiledHeaderPolicy } from '@kb-labs/plugin-adapter-rest';
import { metricsCollector } from './metrics.js';
import { recordHeaderDebug } from '../diagnostics/header-debug.js';
import { applyHeaderTransforms, loadCustomHeaderTransform } from '@kb-labs/plugin-runtime';

type CompiledHeaderRule = CompiledHeaderPolicy['inbound'][number];

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
]);

const SAFE_DEFAULT_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-type',
  'content-length',
  'host',
  'origin',
  'referer',
  'user-agent',
  'pragma',
  'expires',
  'if-none-match',
  'if-modified-since',
  'x-request-id',
  'x-trace-id',
  'traceparent',
  'tracestate',
]);

const SYSTEM_HEADERS = new Set(['traceparent', 'tracestate']);
const FORBIDDEN_ALWAYS = new Set(['proxy-authorization', 'proxy-authenticate']);
const DEFAULT_SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);

const DEBUG_ENV = process.env.KB_HEADERS_DEBUG;

interface HeaderEnforcementState {
  vary: Set<string>;
  sensitive: Set<string>;
  rateLimitKeys: Record<string, string>;
  sanitized: Record<string, string>;
  debugLog?: Array<Record<string, unknown>>;
  totalDroppedInbound: number;
  totalDroppedOutbound: number;
  totalSensitiveInbound: number;
  validationErrors: number;
  pluginId?: string;
  routeId?: string;
  dryRun: boolean;
  metricsFlushed: boolean;
}

type IncomingHeaderValue = string | string[] | undefined;

interface DebugOptions {
  debug: boolean;
  dryRun: boolean;
}

interface EnforcementContext {
  pluginId?: string;
  routeId?: string;
}

export function registerHeaderPolicyMiddleware(server: FastifyInstance): void {
  const debugMode = DEBUG_ENV === '1' || DEBUG_ENV === 'true';
  const dryRunMode = DEBUG_ENV === 'dry-run';

  server.addHook('onRequest', async (request, reply) => {
    const policy = getCompiledPolicy(request);
    const routeConfig = request.routeOptions?.config as
      | { pluginId?: string; pluginRouteId?: string; kbPluginRoot?: string }
      | undefined;
    const context: EnforcementContext = {
      pluginId: routeConfig?.pluginId,
      routeId: routeConfig?.pluginRouteId ?? request.routerPath ?? request.url,
    };
    const options: DebugOptions = {
      debug: debugMode || dryRunMode,
      dryRun: dryRunMode,
    };
    const state = await enforceInboundHeaders(
      request,
      reply,
      policy,
      options,
      context,
      routeConfig?.kbPluginRoot
    );
    (request as any).kbHeaderState = state;
  });

  server.addHook('onSend', async (request, reply, payload) => {
    const policy = getCompiledPolicy(request);
    const state = (request as any).kbHeaderState as HeaderEnforcementState | undefined;
    const routeConfig = request.routeOptions?.config as
      | { pluginId?: string; pluginRouteId?: string; kbPluginRoot?: string }
      | undefined;
    const context: EnforcementContext = {
      pluginId: routeConfig?.pluginId,
      routeId: routeConfig?.pluginRouteId ?? request.routerPath ?? request.url,
    };
    const options: DebugOptions = {
      debug: debugMode || dryRunMode,
      dryRun: dryRunMode,
    };

    await enforceOutboundHeaders(
      request,
      reply,
      state,
      policy,
      options,
      context
    );

    if (state) {
      flushHeaderMetrics(state, request, options);
    }

    if (state && state.vary.size > 0) {
      appendHeaderList(reply, 'Vary', Array.from(state.vary));
    }

    if (policy?.security?.cors?.exposeHeaders?.length) {
      appendHeaderList(reply, 'Access-Control-Expose-Headers', policy.security.cors.exposeHeaders);
    }

    if (policy?.security?.cors?.allowHeaders?.length) {
      appendHeaderList(reply, 'Access-Control-Allow-Headers', policy.security.cors.allowHeaders);
    }

    if (policy?.security?.hsts?.enabled) {
      reply.header(
        'Strict-Transport-Security',
        `max-age=${policy.security.hsts.maxAge}${
          policy.security.hsts.includeSubDomains ? '; includeSubDomains' : ''
        }`
      );
    }

    return payload;
  });
}

function getCompiledPolicy(request: FastifyRequest): CompiledHeaderPolicy | undefined {
  const config = request.routeOptions?.config as { kbHeaders?: CompiledHeaderPolicy } | undefined;
  return config?.kbHeaders;
}

async function enforceInboundHeaders(
  request: FastifyRequest,
  _reply: FastifyReply,
  policy: CompiledHeaderPolicy | undefined,
  options: DebugOptions,
  context: EnforcementContext,
  pluginRoot: string | undefined
): Promise<HeaderEnforcementState> {
  const state: HeaderEnforcementState = {
    vary: new Set<string>(),
    sensitive: new Set<string>(),
    rateLimitKeys: Object.create(null),
    sanitized: Object.create(null),
    debugLog: options.debug ? [] : undefined,
    totalDroppedInbound: 0,
    totalDroppedOutbound: 0,
    totalSensitiveInbound: 0,
    validationErrors: 0,
    pluginId: context.pluginId,
    routeId: context.routeId,
    dryRun: options.dryRun,
    metricsFlushed: false,
  };

  if (!policy) {
    return state;
  }

  const sanitized: Record<string, string> = Object.create(null);
  const requiredRules = new Map<CompiledHeaderRule, boolean>();

  for (const rule of policy.inbound) {
    if (rule.required) {
      requiredRules.set(rule, false);
    }
  }

  const headersObject = request.headers;

  for (const [rawName, rawValue] of Object.entries(headersObject) as Array<[string, IncomingHeaderValue]>) {
    const name = rawName.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(name)) {
      state.totalDroppedInbound += 1;
      if (options.debug) {
        logDecision(state, request, 'inbound', headerCase(name), {
          allowed: false,
          reason: 'hop-by-hop',
        });
      }
      if (!options.dryRun) {
        delete (request.headers as Record<string, unknown>)[rawName];
        delete (request.headers as Record<string, unknown>)[name];
        delete (request.raw.headers as Record<string, unknown>)[rawName];
        delete (request.raw.headers as Record<string, unknown>)[name];
      }
      continue;
    }

    let values = normalizeHeaderValues(rawValue);
    if (values.length === 0) {
      continue;
    }

    if (policy.denyList.has(name)) {
      state.totalDroppedInbound += 1;
      if (options.debug) {
        logDecision(state, request, 'inbound', headerCase(name), {
          allowed: false,
          reason: 'deny-list',
        });
      }
      continue;
    }

    const matchedRule = findMatchingRule(policy.inbound, name);
    let action: 'forward' | 'map' | 'strip' | undefined = matchedRule?.action;

    if (!matchedRule && FORBIDDEN_ALWAYS.has(name)) {
      action = 'strip';
    }

    if (!matchedRule && action !== 'strip') {
      if (policy.allowList.has(name)) {
        action = 'forward';
      } else if (SYSTEM_HEADERS.has(name)) {
        action = 'forward';
      } else if (policy.defaults === 'allowSafe' && SAFE_DEFAULT_HEADERS.has(name)) {
        action = 'forward';
      } else {
        action = 'strip';
      }
    }

    if (!action || action === 'strip') {
      state.totalDroppedInbound += 1;
      if (options.debug) {
        logDecision(state, request, 'inbound', headerCase(name), {
          allowed: false,
          reason: 'not-allowed',
        });
      }
      continue;
    }

    if (matchedRule?.transformPipeline) {
      values = applyHeaderTransforms(matchedRule.transformPipeline, values, {
        header: rawName,
        warn: (message, meta) => {
          request.log?.warn(
            { header: rawName, transform: matchedRule.transformPipeline, ...meta },
            message
          );
        },
      });
      if (values.length === 0) {
        state.totalDroppedInbound += 1;
        continue;
      }
    }

    if (matchedRule?.transformModule) {
      if (!pluginRoot) {
        request.log?.error(
          {
            header: rawName,
            transform: matchedRule.transformModule,
          },
          'Cannot execute header transform without plugin root'
        );
        state.totalDroppedInbound += 1;
        continue;
      }

      try {
        const transformFn = await loadCustomHeaderTransform(
          pluginRoot,
          matchedRule.transformModule.modulePath,
          matchedRule.transformModule.exportName
        );
        const transformedValues: string[] = [];
        for (const value of values) {
          const result = await Promise.resolve(transformFn(value));
          if (typeof result === 'string' && result.length > 0) {
            transformedValues.push(result);
          } else if (result === undefined || result === null || result === '') {
            request.log?.warn(
              {
                header: rawName,
                transform: matchedRule.transformModule,
              },
              'Header transform produced empty value; dropping header'
            );
          } else {
            transformedValues.push(String(result));
          }
        }
        if (transformedValues.length === 0) {
          state.totalDroppedInbound += 1;
          continue;
        }
        values = transformedValues;
      } catch (error) {
        state.totalDroppedInbound += 1;
        const message =
          error instanceof Error ? error.message : 'Failed to execute header transform';
        request.log?.error(
          {
            header: rawName,
            transform: matchedRule.transformModule,
            error: message,
          },
          'Failed to execute header transform'
        );
        if (!options.dryRun) {
          throwHeaderError('E_HEADER_TRANSFORM', message, {
            header: rawName,
            module: matchedRule.transformModule,
          });
        }
        continue;
      }
    }

    if (matchedRule) {
      validateHeaderValues(state, request, options, matchedRule, values);
    } else if (options.debug) {
      logDecision(state, request, 'inbound', headerCase(name), {
        allowed: true,
        action,
        reason: 'default-allow',
      });
    }

    const targetName = matchedRule?.targetName ?? name;
    const serialized = values.join(', ');
    sanitized[targetName] = serialized;

    if (matchedRule && matchedRule.required) {
      requiredRules.set(matchedRule, true);
    }

    if (matchedRule?.cacheVary) {
      state.vary.add(headerCase(targetName));
    }

    if (matchedRule?.rateLimitKey && values[0]) {
      state.rateLimitKeys[targetName] = values[0];
    }

    if (matchedRule?.sensitive || DEFAULT_SENSITIVE_HEADERS.has(targetName)) {
      state.sensitive.add(targetName);
      state.totalSensitiveInbound += 1;
    }
  }

  for (const [rule, satisfied] of requiredRules) {
    if (!satisfied) {
      const missingHeader =
        rule.match.kind === 'exact' ? headerCase(rule.match.name) : 'header matching policy requirements';
      state.validationErrors += 1;
      if (options.debug) {
        logDecision(state, request, 'inbound', missingHeader, {
          allowed: false,
          reason: 'required-missing',
        });
      }
      if (options.dryRun) {
        continue;
      }
      flushHeaderMetrics(state, request, options);
      throwHeaderError(
        'E_HEADER_REQUIRED',
        `Required header is missing: ${missingHeader}`,
        { header: missingHeader, route: request.routerPath }
      );
    }
  }

  if (!options.dryRun) {
    applySanitizedHeaders(request, sanitized);
  }

  state.sanitized = sanitized;
  return state;
}

function enforceOutboundHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  state: HeaderEnforcementState | undefined,
  policy: CompiledHeaderPolicy | undefined,
  options: DebugOptions,
  _context: EnforcementContext
): void {
  if (!state) {
    return;
  }
  const headers = reply.getHeaders();

  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lower)) {
      state.totalDroppedOutbound += 1;
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: false,
          reason: 'hop-by-hop',
        });
      }
      if (!options.dryRun) {
        reply.removeHeader(name);
      }
      continue;
    }

    if (policy?.denyList.has(lower)) {
      state.totalDroppedOutbound += 1;
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: false,
          reason: 'deny-list',
        });
      }
      if (!options.dryRun) {
        reply.removeHeader(name);
      }
      continue;
    }

    const matchedRule = policy?.outbound.find((rule) => rule.matchFn(lower));
    if (matchedRule) {
      if (matchedRule.action === 'strip') {
        state.totalDroppedOutbound += 1;
        if (options.debug) {
          logDecision(state, request, 'outbound', headerCase(lower), {
            allowed: false,
            reason: 'rule-strip',
            rule: ruleSummary(matchedRule),
          });
        }
        if (!options.dryRun) {
          reply.removeHeader(name);
        }
        continue;
      }

      if (matchedRule.action === 'forward') {
        if (matchedRule.sensitive || DEFAULT_SENSITIVE_HEADERS.has(lower)) {
          state.sensitive.add(lower);
        }
        if (options.debug) {
          logDecision(state, request, 'outbound', headerCase(lower), {
            allowed: true,
            reason: 'rule-forward',
            rule: ruleSummary(matchedRule),
          });
        }
        continue;
      }
    } else if (policy) {
      if (policy.defaults === 'deny' && !policy.allowList.has(lower) && !SAFE_DEFAULT_HEADERS.has(lower)) {
        state.totalDroppedOutbound += 1;
        if (options.debug) {
          logDecision(state, request, 'outbound', headerCase(lower), {
            allowed: false,
            reason: 'default-deny',
          });
        }
        if (!options.dryRun) {
          reply.removeHeader(name);
        }
        continue;
      }
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: true,
          reason: 'default',
        });
      }
    }

    if (!policy && FORBIDDEN_ALWAYS.has(lower)) {
      state.totalDroppedOutbound += 1;
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: false,
          reason: 'forbidden-default',
        });
      }
      if (!options.dryRun) {
        reply.removeHeader(name);
      }
      continue;
    }

    if (lower === 'set-cookie' && (!matchedRule || matchedRule.action !== 'forward')) {
      state.totalDroppedOutbound += 1;
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: false,
          reason: 'set-cookie-strip',
        });
      }
      if (!options.dryRun) {
        reply.removeHeader(name);
        request.log?.warn({ header: 'set-cookie' }, 'Stripped Set-Cookie header (no manifest allow rule)');
      }
      continue;
    }

    if (lower === 'authorization') {
      state.totalDroppedOutbound += 1;
      if (options.debug) {
        logDecision(state, request, 'outbound', headerCase(lower), {
          allowed: false,
          reason: 'authorization-strip',
        });
      }
      if (!options.dryRun) {
        reply.removeHeader(name);
      }
      continue;
    }
  }
}

function flushHeaderMetrics(
  state: HeaderEnforcementState,
  request: FastifyRequest,
  options: DebugOptions
): void {
  if (state.metricsFlushed) {
    return;
  }

  metricsCollector.recordHeaderMetrics({
    pluginId: state.pluginId,
    routeId: state.routeId ?? request.routerPath ?? request.url,
    filteredInbound: state.totalDroppedInbound,
    filteredOutbound: state.totalDroppedOutbound,
    sensitiveInbound: state.totalSensitiveInbound,
    varyApplied: state.vary.size,
    validationErrors: state.validationErrors,
    dryRun: state.dryRun,
  });

  if ((options.debug || options.dryRun) && state.debugLog && state.debugLog.length > 0) {
    request.log?.info(
      {
        pluginId: state.pluginId,
        routeId: state.routeId ?? request.routerPath ?? request.url,
        dryRun: state.dryRun,
        decisions: state.debugLog,
      },
      state.dryRun ? 'Header policy dry-run decisions' : 'Header policy debug decisions'
    );

    const routeId = state.routeId ?? request.routerPath ?? request.url;
    const timestamp = Date.now();
    for (const entry of state.debugLog) {
      const direction =
        entry.direction === 'inbound' || entry.direction === 'outbound'
          ? entry.direction
          : 'inbound';
      const headerName =
        typeof entry.header === 'string' && entry.header.length > 0
          ? entry.header
          : 'unknown';
      const allowed =
        typeof entry.allowed === 'boolean' ? entry.allowed : undefined;
      const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
      const action = typeof entry.action === 'string' ? entry.action : undefined;
      const requestId = entry.requestId
        ? String(entry.requestId)
        : String(request.id ?? 'unknown');

      recordHeaderDebug({
        timestamp,
        requestId,
        pluginId: state.pluginId,
        routeId,
        direction,
        header: headerName,
        allowed,
        reason,
        action,
        dryRun: state.dryRun,
      });
    }
  }

  state.metricsFlushed = true;
}

function findMatchingRule(rules: CompiledHeaderRule[], headerName: string): CompiledHeaderRule | undefined {
  const normalized = headerName.toLowerCase();
  for (const rule of rules) {
    if (rule.matchFn(normalized)) {
      return rule;
    }
  }
  return undefined;
}

function normalizeHeaderValues(value: IncomingHeaderValue): string[] {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function validateHeaderValues(
  state: HeaderEnforcementState,
  request: FastifyRequest,
  options: DebugOptions,
  rule: CompiledHeaderRule,
  values: string[]
): void {
  if (!rule.validators || rule.validators.length === 0) {
    return;
  }

  const headerLabel =
    rule.match.kind === 'exact' ? headerCase(rule.match.name) : 'header matching policy requirements';

  for (const validator of rule.validators) {
    switch (validator.kind) {
      case 'regex': {
        const regex = new RegExp(validator.pattern, validator.flags);
        for (const value of values) {
          if (!regex.test(value)) {
            state.validationErrors += 1;
            if (options.debug) {
              logDecision(state, request, 'inbound', headerLabel, {
                allowed: false,
                reason: 'validator-regex',
              });
            }
            if (options.dryRun) {
              continue;
            }
            flushHeaderMetrics(state, request, options);
            throwHeaderError('E_HEADER_INVALID', `Header value does not match required pattern`, {
              header: headerLabel,
            });
          }
        }
        break;
      }
      case 'enum': {
        const allowed = new Set(validator.values);
        for (const value of values) {
          if (!allowed.has(value)) {
            state.validationErrors += 1;
            if (options.debug) {
              logDecision(state, request, 'inbound', headerLabel, {
                allowed: false,
                reason: 'validator-enum',
              });
            }
            if (options.dryRun) {
              continue;
            }
            flushHeaderMetrics(state, request, options);
            throwHeaderError('E_HEADER_INVALID', `Header value is not in allowed list`, {
              header: headerLabel,
            });
          }
        }
        break;
      }
      case 'length': {
        for (const value of values) {
          if (validator.min !== undefined && value.length < validator.min) {
            state.validationErrors += 1;
            if (options.debug) {
              logDecision(state, request, 'inbound', headerLabel, {
                allowed: false,
                reason: 'validator-min-length',
                min: validator.min,
              });
            }
            if (options.dryRun) {
              continue;
            }
            flushHeaderMetrics(state, request, options);
            throwHeaderError('E_HEADER_INVALID', `Header value shorter than minimum length`, {
              header: headerLabel,
            });
          }
          if (validator.max !== undefined && value.length > validator.max) {
            state.validationErrors += 1;
            if (options.debug) {
              logDecision(state, request, 'inbound', headerLabel, {
                allowed: false,
                reason: 'validator-max-length',
                max: validator.max,
              });
            }
            if (options.dryRun) {
              continue;
            }
            flushHeaderMetrics(state, request, options);
            throwHeaderError('E_HEADER_INVALID', `Header value exceeds maximum length`, {
              header: headerLabel,
            });
          }
        }
        break;
      }
    }
  }
}

function applySanitizedHeaders(request: FastifyRequest, sanitized: Record<string, string>): void {
  const headers = request.headers as Record<string, string>;
  Object.keys(headers).forEach((key) => {
    delete headers[key];
  });
  for (const [name, value] of Object.entries(sanitized)) {
    headers[name] = value;
  }

  const rawHeaders = request.raw.headers as Record<string, unknown>;
  Object.keys(rawHeaders).forEach((key) => {
    delete rawHeaders[key];
  });
  for (const [name, value] of Object.entries(sanitized)) {
    rawHeaders[name] = value;
  }
}

function appendHeaderList(reply: FastifyReply, headerName: string, values: string[]): void {
  if (!values.length) {
    return;
  }
  const existing = reply.getHeader(headerName);
  const merged = new Set<string>();

  if (existing) {
    const currentValues = Array.isArray(existing)
      ? existing
      : existing.toString().split(',').map((v) => v.trim());
    for (const value of currentValues) {
      if (value) {
        merged.add(value);
      }
    }
  }

  for (const value of values) {
    if (value) {
      merged.add(value);
    }
  }

  if (merged.size > 0) {
    reply.header(headerName, Array.from(merged).join(', '));
  }
}

function headerCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function throwHeaderError(code: string, message: string, details: Record<string, unknown>): never {
  const error = new Error(message);
  (error as any).statusCode = 400;
  (error as any).code = code;
  (error as any).details = details;
  throw error;
}

function logDecision(
  state: HeaderEnforcementState,
  request: FastifyRequest,
  direction: 'inbound' | 'outbound',
  header: string,
  info: Record<string, unknown>
): void {
  state.debugLog?.push({
    direction,
    header,
    requestId: request.id,
    ...info,
  });
}

function ruleSummary(rule: CompiledHeaderRule): Record<string, unknown> {
  return {
    match: rule.match,
    action: rule.action,
    mapTo: rule.mapTo,
    required: rule.required,
  };
}

