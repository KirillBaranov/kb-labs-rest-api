/**
 * @module @kb-labs/rest-api-app/routes/logs
 * Live log streaming and querying endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { platform } from '@kb-labs/core-runtime';
import type { LogQuery, LogRecord } from '@kb-labs/core-platform';
import type { EventHub } from '../events/hub';

/**
 * Map Pino numeric level to string level
 */
function mapPinoLevelToString(level: any): string {
  if (typeof level === 'string') return level;

  // Pino levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
  if (level <= 10) return 'trace';
  if (level <= 20) return 'debug';
  if (level <= 30) return 'info';
  if (level <= 40) return 'warn';
  if (level <= 50) return 'error';
  return 'fatal';
}

/**
 * Convert internal LogRecord to frontend LogRecord format
 */
function toFrontendLogRecord(record: LogRecord): any {
  // Extract level from fields if it's a Pino log (numeric level)
  const pinoLevel = record.fields.level;
  const levelStr = typeof pinoLevel === 'number'
    ? mapPinoLevelToString(pinoLevel)
    : record.level;

  // Remove 'level' and 'time' from fields to avoid overwriting our converted values
  const { level: _level, time: _time, ...restFields } = record.fields;

  return {
    time: new Date(record.timestamp).toISOString(),
    level: levelStr,
    msg: record.message,
    plugin: record.source,
    ...restFields,
  };
}

/**
 * Build LLM prompt for log summarization
 */
function buildLogSummaryPrompt(
  question: string,
  logs: any[],
  stats: any,
  includeContext: { errors?: boolean; warnings?: boolean; info?: boolean; metadata?: boolean; stackTraces?: boolean }
): string {
  let prompt = `You are analyzing application logs. User question: "${question}"\n\n`;

  // Add statistics
  prompt += `Statistics:\n`;
  prompt += `Total logs: ${stats.total}\n`;
  prompt += `Errors: ${stats.byLevel.error || 0}\n`;
  prompt += `Warnings: ${stats.byLevel.warn || 0}\n`;
  prompt += `Info: ${stats.byLevel.info || 0}\n`;

  if (stats.timeRange.from && stats.timeRange.to) {
    prompt += `Time range: ${stats.timeRange.from} to ${stats.timeRange.to}\n`;
  }

  if (stats.topErrors.length > 0) {
    prompt += `\nTop Errors:\n`;
    stats.topErrors.slice(0, 5).forEach((err: any, idx: number) => {
      prompt += `${idx + 1}. "${err.message}" (${err.count} occurrences)\n`;
    });
  }

  // Filter logs based on includeContext
  const relevantLogs = logs.filter(log => {
    if (!includeContext.errors && log.level === 'error') return false;
    if (!includeContext.warnings && log.level === 'warn') return false;
    if (!includeContext.info && log.level === 'info') return false;
    return true;
  });

  // Add log entries (limit to 100 most recent)
  prompt += `\nLog Entries (${Math.min(relevantLogs.length, 100)} most recent):\n`;
  relevantLogs.slice(-100).forEach(log => {
    prompt += `[${log.time}] ${log.level.toUpperCase()}`;

    if (includeContext.metadata && log.plugin) {
      prompt += ` [${log.plugin}]`;
    }

    prompt += `: ${log.msg || '(no message)'}\n`;

    if (includeContext.metadata && (log.traceId || log.executionId)) {
      if (log.traceId) prompt += `  traceId: ${log.traceId}\n`;
      if (log.executionId) prompt += `  executionId: ${log.executionId}\n`;
    }

    if (includeContext.stackTraces && log.err?.stack) {
      prompt += `  stack: ${log.err.stack.split('\n').slice(0, 5).join('\n  ')}\n`;
    }
  });

  // Add instructions
  prompt += `\nInstructions:\n`;
  prompt += `Provide a clear, concise summary answering the user's question as plain text. Focus on:\n`;
  prompt += `1. What happened (timeline of events)\n`;
  prompt += `2. Root causes if errors are present\n`;
  prompt += `3. Patterns or trends you notice\n`;
  prompt += `4. Actionable recommendations if applicable\n`;
  prompt += `\nKeep the summary under 300 words. Use simple paragraphs separated by double newlines. Do not use markdown formatting (no **, ##, -, or other markdown syntax). Write in clear, professional language.\n`;

  return prompt;
}

/**
 * Generate fallback summary when LLM is unavailable
 */
function generateFallbackSummary(stats: any, logs: any[]): string {
  let summary = `Log Summary\n\n`;

  summary += `Total Logs: ${stats.total}\n\n`;

  // Level breakdown
  summary += `By Level:\n`;
  Object.entries(stats.byLevel).forEach(([level, count]) => {
    summary += `${level}: ${count}\n`;
  });
  summary += `\n`;

  // Plugin breakdown
  if (Object.keys(stats.byPlugin).length > 0) {
    summary += `By Plugin:\n`;
    Object.entries(stats.byPlugin)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([plugin, count]) => {
        summary += `${plugin}: ${count}\n`;
      });
    summary += `\n`;
  }

  // Top errors
  if (stats.topErrors.length > 0) {
    summary += `Top Errors:\n`;
    stats.topErrors.slice(0, 5).forEach((err: any, idx: number) => {
      summary += `${idx + 1}. "${err.message}" (${err.count} times)\n`;
    });
    summary += `\n`;
  }

  // Time range
  if (stats.timeRange.from && stats.timeRange.to) {
    summary += `Time Range: ${stats.timeRange.from} to ${stats.timeRange.to}\n\n`;
  }

  summary += `Note: LLM summarization is not available. This is a basic statistical summary.`;

  return summary;
}

/**
 * Register log observability routes
 */
export async function registerLogRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  eventHub: EventHub
): Promise<void> {
  /**
   * GET /api/v1/logs
   * Query logs with filters
   */
  server.get<{
    Querystring: {
      from?: string;
      to?: string;
      level?: string;
      plugin?: string;
      executionId?: string;
      tenantId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/v1/logs', async (request, reply) => {
    // Check if logger supports buffering
    const buffer = platform.logger.getLogBuffer?.();
    if (!buffer) {
      return reply.code(503).send({
        ok: false,
        error: 'Log streaming not enabled',
        message: 'Logger adapter does not support buffering. Enable streaming in kb.config.json',
      });
    }

    // Build query from request params (convert frontend format to backend format)
    const query: LogQuery = {
      level: request.query.level as any,
      source: request.query.plugin,
      startTime: request.query.from ? new Date(request.query.from).getTime() : undefined,
      endTime: request.query.to ? new Date(request.query.to).getTime() : undefined,
      limit: request.query.limit ?? 100,
    };

    // Query logs from buffer
    const logs = buffer.query(query);
    const stats = buffer.getStats();

    // Convert to frontend format
    const frontendLogs = logs.map(toFrontendLogRecord);

    // Apply text search filter if provided
    let filteredLogs = frontendLogs;
    if (request.query.search) {
      const search = request.query.search.toLowerCase();
      filteredLogs = frontendLogs.filter(log =>
        log.msg?.toLowerCase().includes(search)
      );
    }

    // Apply offset pagination
    const offset = request.query.offset ?? 0;
    const paginatedLogs = filteredLogs.slice(offset, offset + query.limit!);

    return {
      ok: true,
      data: {
        logs: paginatedLogs,
        total: filteredLogs.length,
        filters: request.query,
        bufferStats: {
          size: stats.total,
          maxSize: stats.bufferSize,
          oldest: stats.oldestTimestamp ? new Date(stats.oldestTimestamp).toISOString() : undefined,
          newest: stats.newestTimestamp ? new Date(stats.newestTimestamp).toISOString() : undefined,
        },
      },
    };
  });

  /**
   * GET /api/v1/logs/stream
   * Server-Sent Events stream for real-time logs
   */
  server.get('/api/v1/logs/stream', async (request, reply) => {
    // Check if logger supports buffering
    const buffer = platform.logger.getLogBuffer?.();
    if (!buffer) {
      return reply.code(503).send({
        error: 'Log streaming not enabled',
        message: 'Logger adapter does not support buffering. Enable streaming in kb.config.json',
      });
    }

    // Tell Fastify we're manually managing the response
    reply.hijack();

    // Track if stream is closed to prevent double-end
    let streamClosed = false;

    // Explicit CORS headers for EventSource
    const origin = request.headers.origin;
    if (origin === 'http://localhost:3000' || origin === 'http://localhost:5173') {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Setup SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');

    try {
      reply.raw.flushHeaders?.();
      reply.raw.write(': connected\n\n');
    } catch (err) {
      // Headers already sent or connection closed
      streamClosed = true;
      return;
    }

    // Subscribe to log stream
    const unsubscribe = buffer.subscribe((log) => {
      // Check if connection is still alive before writing
      if (!streamClosed && !reply.raw.writableEnded && !reply.raw.destroyed) {
        try {
          // Frontend expects event name 'log'
          const frontendLog = toFrontendLogRecord(log);
          reply.raw.write(`event: log\n`);
          reply.raw.write(`data: ${JSON.stringify(frontendLog)}\n\n`);
        } catch (err) {
          // Connection closed while writing - ignore
          streamClosed = true;
        }
      }
    });

    // Cleanup on disconnect
    const cleanup = () => {
      if (!streamClosed) {
        streamClosed = true;
        unsubscribe();
        try {
          if (!reply.raw.writableEnded && !reply.raw.destroyed) {
            reply.raw.end();
          }
        } catch (err) {
          // Already closed - ignore
        }
      }
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    // Keep connection alive indefinitely
    await new Promise<void>(() => {});
  });

  /**
   * GET /api/v1/logs/stats
   * Get buffer statistics
   */
  server.get('/api/v1/logs/stats', async (request, reply) => {
    // Check if logger supports buffering
    const buffer = platform.logger.getLogBuffer?.();
    if (!buffer) {
      return reply.code(503).send({
        error: 'Log streaming not enabled',
        message: 'Logger adapter does not support buffering. Enable streaming in kb.config.json',
      });
    }

    const stats = buffer.getStats();
    return {
      size: stats.total,
      maxSize: stats.bufferSize,
      oldest: stats.oldestTimestamp ? new Date(stats.oldestTimestamp).toISOString() : undefined,
      newest: stats.newestTimestamp ? new Date(stats.newestTimestamp).toISOString() : undefined,
    };
  });

  /**
   * POST /api/v1/logs/summarize
   * AI-powered log summarization (placeholder for future implementation)
   *
   * Expected request body:
   * {
   *   "timeRange": { "from": "ISO timestamp", "to": "ISO timestamp" },
   *   "filters": { "level": "error", "plugin": "rest", "traceId": "..." },
   *   "groupBy": "trace" | "execution" | "plugin",
   *   "question": "What happened in the last 5 minutes?" (optional)
   * }
   */
  server.post<{
    Body: {
      timeRange?: { from?: string; to?: string };
      filters?: {
        level?: string;
        plugin?: string;
        traceId?: string;
        executionId?: string;
      };
      groupBy?: 'trace' | 'execution' | 'plugin';
      question?: string;
      includeContext?: {
        errors?: boolean;
        warnings?: boolean;
        info?: boolean;
        metadata?: boolean;
        stackTraces?: boolean;
      };
    };
  }>('/api/v1/logs/summarize', async (request, reply) => {
    // Check if logger supports buffering
    const buffer = platform.logger.getLogBuffer?.();
    if (!buffer) {
      return reply.code(503).send({
        ok: false,
        error: 'Log streaming not enabled',
        message: 'Logger adapter does not support buffering. Enable streaming in kb.config.json',
      });
    }

    const { timeRange, filters, groupBy, question, includeContext } = request.body;

    // Build query from request
    const query: LogQuery = {
      level: filters?.level as any,
      source: filters?.plugin,
      startTime: timeRange?.from ? new Date(timeRange.from).getTime() : undefined,
      endTime: timeRange?.to ? new Date(timeRange.to).getTime() : undefined,
      limit: 1000, // Limit for summarization
    };

    // Query logs
    const logs = buffer.query(query);
    const frontendLogs = logs.map(toFrontendLogRecord);

    // Additional filters (traceId, executionId)
    let filteredLogs = frontendLogs;
    if (filters?.traceId) {
      filteredLogs = filteredLogs.filter((log) => log.traceId === filters.traceId);
    }
    if (filters?.executionId) {
      filteredLogs = filteredLogs.filter((log) => log.executionId === filters.executionId);
    }

    // Calculate aggregated statistics
    const stats = {
      total: filteredLogs.length,
      byLevel: {} as Record<string, number>,
      byPlugin: {} as Record<string, number>,
      topErrors: [] as Array<{ message: string; count: number }>,
      timeRange: {
        from: filteredLogs.length > 0 ? filteredLogs[0]!.time : null,
        to: filteredLogs.length > 0 ? filteredLogs[filteredLogs.length - 1]!.time : null,
      },
    };

    const errorMessages = new Map<string, number>();

    for (const log of filteredLogs) {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

      // Count by plugin
      if (log.plugin) {
        stats.byPlugin[log.plugin] = (stats.byPlugin[log.plugin] || 0) + 1;
      }

      // Track error messages
      if (log.level === 'error' && log.msg) {
        errorMessages.set(log.msg, (errorMessages.get(log.msg) || 0) + 1);
      }
    }

    // Top 10 errors
    stats.topErrors = Array.from(errorMessages.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Group logs if requested
    let groups: Record<string, any[]> | null = null;
    if (groupBy) {
      // Map frontend groupBy values to actual log field names
      const fieldMap: Record<string, string> = {
        trace: 'traceId',
        execution: 'executionId',
        plugin: 'plugin',
      };

      const groupMap = new Map<string, any[]>();
      for (const log of filteredLogs) {
        const fieldName = fieldMap[groupBy] || groupBy;
        const key = String(log[fieldName] || 'unknown');
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(log);
      }
      groups = Object.fromEntries(groupMap.entries());
    }

    // AI Summarization
    let aiSummary: string | null = null;
    let message: string | null = null;

    if (platform.llm && question) {
      try {
        const context = includeContext || {
          errors: true,
          warnings: true,
          info: false,
          metadata: true,
          stackTraces: true,
        };

        const prompt = buildLogSummaryPrompt(question, filteredLogs, stats, context);

        const response = await platform.llm.complete(prompt, {
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: 'You are a technical log analysis assistant. Provide clear, actionable insights based on application logs.',
        });

        aiSummary = response.content.trim();

      } catch (error) {
        // Graceful degradation
        server.log.warn({ err: error }, 'LLM summarization failed, using fallback');
        aiSummary = generateFallbackSummary(stats, filteredLogs);
        message = 'AI summarization unavailable, showing statistical summary';
      }
    } else {
      // No LLM or no question - return fallback
      aiSummary = generateFallbackSummary(stats, filteredLogs);
      message = platform.llm ? 'No question provided' : 'LLM not configured';
    }

    // Return structured data with AI summary
    return {
      ok: true,
      data: {
        summary: {
          question: question || 'General log summary',
          timeRange: stats.timeRange,
          total: stats.total,
          stats,
          groups,
        },
        aiSummary,
        message,
      },
    };
  });
}
