import { defineHandler } from '@kb-labs/sdk';

// src/rest/stats-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/stats-handler.ts
var stats_handler_default = defineHandler({
  async execute(ctx, _input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const url = `${daemonUrl}/api/v1/stats`;
    ctx.platform.logger.info(`[stats-handler] Fetching stats from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch stats");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[stats-handler] Error fetching stats",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { stats_handler_default as default };
//# sourceMappingURL=stats-handler.js.map
//# sourceMappingURL=stats-handler.js.map