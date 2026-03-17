import { defineHandler } from '@kb-labs/sdk';

// src/rest/job-steps-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/job-steps-handler.ts
var job_steps_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params;
    const url = `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/steps`;
    ctx.platform.logger.info(`[job-steps-handler] Fetching steps from ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Job not found");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (!result.ok || !result.data) {
        throw new Error(result.error || "Failed to fetch job steps");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[job-steps-handler] Error fetching job steps",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { job_steps_handler_default as default };
//# sourceMappingURL=job-steps-handler.js.map
//# sourceMappingURL=job-steps-handler.js.map