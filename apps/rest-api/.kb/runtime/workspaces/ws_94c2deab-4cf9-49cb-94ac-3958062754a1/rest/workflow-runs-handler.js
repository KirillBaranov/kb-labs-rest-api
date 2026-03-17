import { defineHandler } from '@kb-labs/sdk';

// src/rest/workflow-runs-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/workflow-runs-handler.ts
var workflow_runs_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id: workflowId } = input.params;
    const { limit, offset, status } = input.query || {};
    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1e3) : 50;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validStatuses = ["queued", "running", "completed", "failed", "cancelled"];
    const validatedStatus = status && validStatuses.includes(status) ? status : void 0;
    const params = new URLSearchParams();
    params.append("limit", String(validatedLimit));
    params.append("offset", String(validatedOffset));
    if (validatedStatus) {
      params.append("status", validatedStatus);
    }
    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/runs?${params}`;
    ctx.platform.logger.info(`[workflow-runs-handler] Fetching run history from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Workflow not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch workflow run history");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[workflow-runs-handler] Error fetching workflow run history",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { workflow_runs_handler_default as default };
//# sourceMappingURL=workflow-runs-handler.js.map
//# sourceMappingURL=workflow-runs-handler.js.map