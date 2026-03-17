import { defineHandler } from '@kb-labs/sdk';

// src/rest/job-logs-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/job-logs-handler.ts
var job_logs_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params;
    const { limit, offset, level } = input.query || {};
    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1e3) : 100;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validLevels = ["info", "warn", "error", "debug", "all"];
    const validatedLevel = level && validLevels.includes(level) ? level : "all";
    const params = new URLSearchParams();
    params.append("limit", String(validatedLimit));
    params.append("offset", String(validatedOffset));
    params.append("level", validatedLevel);
    const url = `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/logs?${params}`;
    ctx.platform.logger.info(`[job-logs-handler] Fetching logs from ${url}`);
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
        throw new Error(result.error || "Failed to fetch job logs");
      }
      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        "[job-logs-handler] Error fetching job logs",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { job_logs_handler_default as default };
//# sourceMappingURL=job-logs-handler.js.map
//# sourceMappingURL=job-logs-handler.js.map