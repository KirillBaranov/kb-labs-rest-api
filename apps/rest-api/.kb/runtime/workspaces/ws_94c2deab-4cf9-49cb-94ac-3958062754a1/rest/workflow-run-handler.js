import { defineHandler } from '@kb-labs/sdk';

// src/rest/workflow-run-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/workflow-run-handler.ts
var workflow_run_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id } = input.params;
    if (!id) {
      throw new Error("Missing id parameter");
    }
    const body = input.body || {};
    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(id)}/run`;
    ctx.platform.logger.info(`[workflow-run-handler] Running workflow ${id} via ${url}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Workflow not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to run workflow");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[workflow-run-handler] Error running workflow",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { workflow_run_handler_default as default };
//# sourceMappingURL=workflow-run-handler.js.map
//# sourceMappingURL=workflow-run-handler.js.map