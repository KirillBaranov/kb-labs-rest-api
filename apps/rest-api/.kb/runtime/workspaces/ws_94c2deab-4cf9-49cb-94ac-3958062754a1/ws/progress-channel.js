import { defineMessage, defineWebSocket, MessageRouter } from '@kb-labs/sdk';

// src/ws/progress-channel.ts
var SubscribeMsg = defineMessage("subscribe");
var UnsubscribeMsg = defineMessage("unsubscribe");
var StepStartMsg = defineMessage("step_start");
var ErrorMsg = defineMessage("error");
var progress_channel_default = defineWebSocket({
  path: "/progress/:jobId",
  description: "Real-time job progress updates",
  handler: {
    async onConnect(ctx, sender) {
      ctx.platform.logger.info("[progress-channel] Client connected", { connectionId: sender.getConnectionId() });
    },
    async onMessage(ctx, message, sender) {
      const router = new MessageRouter().on(SubscribeMsg, async (ctx2, payload, _rawSender) => {
        const { jobId } = payload;
        ctx2.platform.logger.info("[progress-channel] Subscribed to progress updates", { jobId });
        await sender.send(
          StepStartMsg.create({
            stepName: "initialization",
            stepIndex: 0
          })
        );
      }).on(UnsubscribeMsg, async (ctx2, _payload, _rawSender) => {
        ctx2.platform.logger.info("[progress-channel] Unsubscribed from progress updates");
      });
      await router.handle(ctx, message, sender.raw);
    },
    async onDisconnect(ctx, code, reason) {
      ctx.platform.logger.info("[progress-channel] Client disconnected", { code, reason });
    },
    async onError(ctx, error, sender) {
      ctx.platform.logger.error("[progress-channel] Error", error);
      try {
        await sender.send(ErrorMsg.create({ error: error.message }));
      } catch (sendError) {
        ctx.platform.logger.error("[progress-channel] Failed to send error message", sendError instanceof Error ? sendError : void 0);
      }
    }
  }
});

export { progress_channel_default as default };
//# sourceMappingURL=progress-channel.js.map
//# sourceMappingURL=progress-channel.js.map