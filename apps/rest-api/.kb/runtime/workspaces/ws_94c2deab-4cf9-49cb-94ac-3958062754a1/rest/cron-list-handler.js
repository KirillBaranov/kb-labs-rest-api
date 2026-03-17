import { defineHandler } from '@kb-labs/sdk';

// src/rest/cron-list-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/cron-list-handler.ts
var cron_list_handler_default = defineHandler({
  async execute(ctx, _input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const url = `${daemonUrl}/api/v1/cron`;
    ctx.platform.logger.info(`[cron-list-handler] Fetching cron jobs from ${url}`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        ctx.platform.logger.error(`[cron-list-handler] Failed to fetch cron jobs: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || "Failed to fetch cron jobs");
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to fetch cron jobs");
      }
      const data = payload.data;
      ctx.platform.logger.info(`[cron-list-handler] Fetched ${data.crons.length} cron jobs`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        "[cron-list-handler] Error fetching cron list",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { cron_list_handler_default as default };
//# sourceMappingURL=cron-list-handler.js.map
//# sourceMappingURL=cron-list-handler.js.map