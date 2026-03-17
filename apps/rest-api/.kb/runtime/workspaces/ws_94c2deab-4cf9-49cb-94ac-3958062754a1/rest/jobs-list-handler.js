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

export { jobs_list_handler_default as default };
//# sourceMappingURL=jobs-list-handler.js.map
//# sourceMappingURL=jobs-list-handler.js.map