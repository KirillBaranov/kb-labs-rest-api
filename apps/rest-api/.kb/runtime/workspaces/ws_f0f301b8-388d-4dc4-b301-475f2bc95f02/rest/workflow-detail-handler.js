import { defineHandler } from '@kb-labs/sdk';

// src/rest/workflow-detail-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/workflow-detail-handler.ts
var workflow_detail_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id } = input.params;
    if (!id) {
      throw new Error("Missing id parameter");
    }
    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(id)}`;
    ctx.platform.logger.info(`[workflow-detail-handler] Fetching workflow ${id} from ${url}`);
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
        throw new Error(result.error || "Failed to fetch workflow");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[workflow-detail-handler] Error fetching workflow detail",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { workflow_detail_handler_default as default };
//# sourceMappingURL=workflow-detail-handler.js.map
//# sourceMappingURL=workflow-detail-handler.js.map