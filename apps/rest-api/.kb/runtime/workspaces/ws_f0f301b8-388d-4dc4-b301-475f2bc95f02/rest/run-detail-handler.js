import { defineHandler } from '@kb-labs/sdk';

// src/rest/run-detail-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/run-detail-handler.ts
var run_detail_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params;
    if (!runId) {
      throw new Error("Missing runId parameter");
    }
    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}`;
    ctx.platform.logger.info(`[run-detail-handler] Fetching run ${runId} from ${url}`);
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
        throw new Error(result.error || "Failed to fetch run");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[run-detail-handler] Error fetching run",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { run_detail_handler_default as default };
//# sourceMappingURL=run-detail-handler.js.map
//# sourceMappingURL=run-detail-handler.js.map