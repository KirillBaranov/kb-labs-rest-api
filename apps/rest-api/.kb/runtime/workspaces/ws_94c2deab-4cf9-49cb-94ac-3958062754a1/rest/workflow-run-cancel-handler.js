import { defineHandler } from '@kb-labs/sdk';

// src/rest/workflow-run-cancel-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/workflow-run-cancel-handler.ts
var workflow_run_cancel_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params;
    if (!runId) {
      throw new Error("Missing runId parameter");
    }
    const url = `${daemonUrl}/api/v1/workflows/runs/${encodeURIComponent(runId)}/cancel`;
    ctx.platform.logger.info(`[workflow-run-cancel-handler] Cancelling run ${runId} at ${url}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to cancel run ${runId}`);
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to cancel run ${runId}`);
      }
      return payload.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[workflow-run-cancel-handler] Error cancelling run",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { workflow_run_cancel_handler_default as default };
//# sourceMappingURL=workflow-run-cancel-handler.js.map
//# sourceMappingURL=workflow-run-cancel-handler.js.map