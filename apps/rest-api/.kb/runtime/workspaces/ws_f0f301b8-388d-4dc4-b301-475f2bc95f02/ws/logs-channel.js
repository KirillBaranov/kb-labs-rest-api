import { defineMessage, defineWebSocket, MessageRouter } from '@kb-labs/sdk';

// src/ws/logs-channel.ts
var SubscribeMsg = defineMessage("subscribe");
var UnsubscribeMsg = defineMessage("unsubscribe");
var LogMsg = defineMessage("log");
var ErrorMsg = defineMessage("error");
var subscriptions = /* @__PURE__ */ new Map();
function normalizeLevel(level) {
  switch (level) {
    case "trace":
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
    case "fatal":
      return "error";
    default:
      return "info";
  }
}
function levelMatches(logLevel, filterLevel) {
  if (!filterLevel || filterLevel === "all") {
    return true;
  }
  const levelOrder = {
    debug: 0,
    trace: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 3
  };
  const logPriority = levelOrder[logLevel] ?? 1;
  const filterPriority = levelOrder[filterLevel] ?? 0;
  return logPriority >= filterPriority;
}
var logs_channel_default = defineWebSocket({
  path: "/logs/:jobId",
  description: "Real-time job logs streaming",
  handler: {
    async onConnect(ctx, sender) {
      const connectionId = sender.getConnectionId();
      ctx.platform.logger.info("[logs-channel] Client connected", { connectionId });
      const capabilities = ctx.platform.logs.getCapabilities();
      if (!capabilities.hasStreaming) {
        await sender.send(
          ErrorMsg.create({
            error: "Log streaming not available. Enable logRingBuffer adapter in config."
          })
        );
        sender.close(1011, "Streaming not available");
      }
    },
    async onMessage(ctx, message, sender) {
      const connectionId = sender.getConnectionId();
      const router = new MessageRouter().on(SubscribeMsg, async (ctx2, payload, _rawSender) => {
        const { jobId, level } = payload;
        ctx2.platform.logger.info("[logs-channel] Subscribing to logs", { connectionId, jobId, level });
        const existingUnsubscribe = subscriptions.get(connectionId);
        if (existingUnsubscribe) {
          existingUnsubscribe();
        }
        const filter = {
          source: jobId
          // Logs are tagged with jobId as source
        };
        const unsubscribe = ctx2.platform.logs.subscribe((log) => {
          if (!levelMatches(log.level, level)) {
            return;
          }
          const logJobId = log.fields?.jobId ?? log.fields?.runId ?? log.source;
          if (logJobId !== jobId) {
            return;
          }
          sender.send(
            LogMsg.create({
              timestamp: new Date(log.timestamp).toISOString(),
              level: normalizeLevel(log.level),
              message: log.message,
              context: log.fields
            })
          ).catch((err) => {
            ctx2.platform.logger.error("[logs-channel] Failed to send log", err instanceof Error ? err : void 0);
          });
        }, filter);
        subscriptions.set(connectionId, unsubscribe);
        await sender.send(
          LogMsg.create({
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "info",
            message: `Subscribed to logs for job ${jobId} (level: ${level || "all"})`
          })
        );
      }).on(UnsubscribeMsg, async (ctx2, _payload, _rawSender) => {
        ctx2.platform.logger.info("[logs-channel] Unsubscribing from logs", { connectionId });
        const unsubscribe = subscriptions.get(connectionId);
        if (unsubscribe) {
          unsubscribe();
          subscriptions.delete(connectionId);
        }
        await sender.send(
          LogMsg.create({
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "info",
            message: "Unsubscribed from logs"
          })
        );
      });
      await router.handle(ctx, message, sender.raw);
    },
    async onDisconnect(ctx, code, reason) {
      ctx.platform.logger.info("[logs-channel] Client disconnected", { code, reason });
    },
    async onError(ctx, error, sender) {
      ctx.platform.logger.error("[logs-channel] Error", error);
      try {
        await sender.send(ErrorMsg.create({ error: error.message }));
      } catch (sendError) {
        ctx.platform.logger.error("[logs-channel] Failed to send error message", sendError instanceof Error ? sendError : void 0);
      }
    },
    cleanup() {
    }
  }
});

export { logs_channel_default as default, levelMatches, normalizeLevel, subscriptions };
//# sourceMappingURL=logs-channel.js.map
//# sourceMappingURL=logs-channel.js.map