import { defineHandler } from '@kb-labs/sdk';

// src/rest/runs-list-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/runs-list-handler.ts
var runs_list_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { status, limit, offset } = input.query || {};
    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1e3) : 50;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validStatuses = ["queued", "running", "success", "failed", "cancelled"];
    const validatedStatus = status && validStatuses.includes(status) ? status : void 0;
    const params = new URLSearchParams();
    params.append("limit", String(validatedLimit));
    params.append("offset", String(validatedOffset));
    if (validatedStatus) {
      params.append("status", validatedStatus);
    }
    const url = `${daemonUrl}/api/v1/runs?${params}`;
    ctx.platform.logger.info(`[runs-list-handler] Fetching runs from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch runs");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[runs-list-handler] Error fetching runs",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { runs_list_handler_default as default };
//# sourceMappingURL=runs-list-handler.js.map
//# sourceMappingURL=runs-list-handler.js.map