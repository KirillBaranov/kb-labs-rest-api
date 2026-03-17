import { defineHandler } from '@kb-labs/sdk';

// src/rest/resolve-approval-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/resolve-approval-handler.ts
var resolve_approval_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params;
    const body = input.body;
    if (!runId) {
      throw new Error("Missing runId parameter");
    }
    if (!body || !body.jobId || !body.stepId || !body.action) {
      throw new Error("Missing required fields: jobId, stepId, action");
    }
    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}/approve`;
    ctx.platform.logger.info(`[resolve-approval-handler] Resolving approval for run ${runId}, step ${body.stepId}: ${body.action}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Run, job, or step not found");
        }
        if (response.status === 409) {
          const errResult = await response.json();
          throw new Error(errResult.error || "Step is not waiting for approval");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to resolve approval");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[resolve-approval-handler] Error resolving approval",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { resolve_approval_handler_default as default };
//# sourceMappingURL=resolve-approval-handler.js.map
//# sourceMappingURL=resolve-approval-handler.js.map