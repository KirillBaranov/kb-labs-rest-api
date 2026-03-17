import { defineHandler } from '@kb-labs/sdk';

// src/rest/jobs-list-handler.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
function getWorkflowDaemonUrl() {
  return process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

// src/rest/jobs-list-handler.ts
var jobs_list_handler_default = defineHandler({
  async execute(ctx, input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const { type, status, limit, offset } = input.query || {};
    const params = new URLSearchParams();
    if (type) {
      params.set("type", type);
    }
    if (status) {
      params.set("status", status);
    }
    if (limit) {
      params.set("limit", limit);
    }
    if (offset) {
      params.set("offset", offset);
    }
    const queryString = params.toString();
    const url = `${daemonUrl}/api/v1/jobs${queryString ? `?${queryString}` : ""}`;
    ctx.platform.logger.info(`[jobs-list-handler] Fetching jobs from ${url}`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        ctx.platform.logger.error(`[jobs-list-handler] Failed to fetch jobs: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || "Failed to fetch jobs list");
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to fetch jobs list");
      }
      const data = payload.data;
      ctx.platform.logger.info(`[jobs-list-handler] Fetched ${data.jobs.length} jobs`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        "[jobs-list-handler] Error fetching jobs list",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});
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
var cron_list_handler_default = defineHandler({
  async execute(ctx, _input) {
    const daemonUrl = getWorkflowDaemonUrl();
    const url = `${daemonUrl}/api/v1/cron`;
    ctx.platform.logger.info(`[cron-list-handler] Fetching cron jobs from ${url}`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        ctx.platform.logger.error(`[cron-list-handler] Failed to fetch cron jobs: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || "Failed to fetch cron jobs");
      }
      const payload = await response.json();
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to fetch cron jobs");
      }
      const data = payload.data;
      ctx.platform.logger.info(`[cron-list-handler] Fetched ${data.crons.length} cron jobs`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        "[cron-list-handler] Error fetching cron list",
        error instanceof Error ? error : void 0
      );
      throw error;
    }
  }
});

export { cron_list_handler_default as handleCronList, job_cancel_handler_default as handleJobCancel, job_detail_handler_default as handleJobDetail, jobs_list_handler_default as handleJobsList };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map