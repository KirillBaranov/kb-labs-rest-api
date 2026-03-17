import { defineHandler } from '@kb-labs/sdk';

// src/rest/pending-approvals-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/pending-approvals-handler.ts
var pending_approvals_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params;
    if (!runId) {
      throw new Error("Missing runId parameter");
    }
    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}/pending-approvals`;
    ctx.platform.logger.info(`[pending-approvals-handler] Fetching pending approvals for run ${runId}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Run not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch pending approvals");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[pending-approvals-handler] Error fetching pending approvals",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { pending_approvals_handler_default as default };
//# sourceMappingURL=pending-approvals-handler.js.map
//# sourceMappingURL=pending-approvals-handler.js.map