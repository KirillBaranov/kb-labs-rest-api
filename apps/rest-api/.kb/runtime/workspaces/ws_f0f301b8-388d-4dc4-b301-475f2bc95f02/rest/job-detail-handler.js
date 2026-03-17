import { defineHandler } from '@kb-labs/sdk';

// src/rest/job-detail-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/job-detail-handler.ts
var job_detail_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params;
    if (!jobId) {
      throw new Error("Missing jobId parameter");
    }
    const url = `${daemonUrl}/api/v1/jobs/${jobId}`;
    ctx.platform.logger.info(`[job-detail-handler] Fetching job ${jobId} from ${url}`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        ctx.platform.logger.error(`[job-detail-handler] Failed to fetch job: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || `Failed to fetch job ${jobId}`);
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to fetch job ${jobId}`);
      }
      const data = payload.data;
      ctx.platform.logger.info(`[job-detail-handler] Fetched job ${jobId}, status: ${data.status}`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        "[job-detail-handler] Error fetching job detail",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { job_detail_handler_default as default };
//# sourceMappingURL=job-detail-handler.js.map
//# sourceMappingURL=job-detail-handler.js.map