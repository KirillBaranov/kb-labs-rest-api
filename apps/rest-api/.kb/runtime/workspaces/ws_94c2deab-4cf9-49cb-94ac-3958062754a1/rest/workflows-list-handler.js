import { defineHandler } from '@kb-labs/sdk';

// src/rest/workflows-list-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/workflows-list-handler.ts
var workflows_list_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { source, status, tags } = input.query || {};
    const params = new URLSearchParams();
    if (source) {
      params.append("source", source);
    }
    if (status) {
      params.append("status", status);
    }
    if (tags) {
      params.append("tags", tags);
    }
    const queryString = params.toString();
    const url = `${daemonUrl}/api/v1/workflows${queryString ? `?${queryString}` : ""}`;
    ctx.platform.logger.info(`[workflows-list-handler] Fetching workflows from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch workflows");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[workflows-list-handler] Error fetching workflows",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { workflows_list_handler_default as default };
//# sourceMappingURL=workflows-list-handler.js.map
//# sourceMappingURL=workflows-list-handler.js.map