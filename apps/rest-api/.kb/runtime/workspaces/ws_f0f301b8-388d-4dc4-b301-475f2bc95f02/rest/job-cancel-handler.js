import { defineHandler } from '@kb-labs/sdk';

// src/rest/job-cancel-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/job-cancel-handler.ts
var job_cancel_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params;
    if (!jobId) {
      throw new Error("Missing jobId parameter");
    }
    const url = `${daemonUrl}/api/v1/jobs/${jobId}/cancel`;
    ctx.platform.logger.info(`[job-cancel-handler] Cancelling job ${jobId} at ${url}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        ctx.platform.logger.error(`[job-cancel-handler] Failed to cancel job: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || `Failed to cancel job ${jobId}`);
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to cancel job ${jobId}`);
      }
      const data = payload.data;
      ctx.platform.logger.info(`[job-cancel-handler] Job ${jobId} cancelled: ${data.cancelled}`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        "[job-cancel-handler] Error cancelling job",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { job_cancel_handler_default as default };
//# sourceMappingURL=job-cancel-handler.js.map
//# sourceMappingURL=job-cancel-handler.js.map