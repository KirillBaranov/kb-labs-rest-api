import { defineCommand } from '@kb-labs/sdk';

// src/commands/list.ts

// src/http-client.ts
var DEFAULT_DAEMON_URL = "http://localhost:7778";
var WorkflowDaemonClient = class {
  baseUrl;
  constructor(options = {}) {
    this.baseUrl = options.url ?? process.env.WORKFLOW_DAEMON_URL ?? DEFAULT_DAEMON_URL;
  }
  /**
   * Validate response Content-Type and parse JSON safely
   */
  async parseJsonResponse(response) {
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new Error(`Invalid Content-Type: expected application/json, got ${contentType}`);
    }
    return response.json();
  }
  unwrapData(payload) {
    if (payload && typeof payload === "object" && "ok" in payload && payload.ok === true && "data" in payload) {
      return payload.data;
    }
    return payload;
  }
  /**
   * Validate and encode job ID to prevent path traversal attacks
   */
  validateAndEncodeJobId(jobId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      throw new Error(`Invalid job ID format: ${jobId}`);
    }
    return encodeURIComponent(jobId);
  }
  /**
   * Health check
   */
  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return this.parseJsonResponse(response);
  }
  /**
   * Get workflow metrics
   */
  async getMetrics() {
    const response = await fetch(`${this.baseUrl}/metrics`);
    if (!response.ok) {
      throw new Error(`Failed to get metrics: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    return this.unwrapData(data);
  }
  /**
   * Get job status with full details (jobs, steps, outputs)
   */
  async getJobStatus(jobId) {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    return this.unwrapData(data);
  }
  /**
   * Get job steps with outputs
   */
  async getJobSteps(jobId) {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/steps`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job steps: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    return this.unwrapData(data);
  }
  /**
   * Get job logs
   */
  async getJobLogs(jobId) {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/logs`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job logs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    const unwrapped = this.unwrapData(data);
    return unwrapped.logs ?? [];
  }
  /**
   * Get active executions
   */
  async getExecutions() {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs`);
    if (!response.ok) {
      throw new Error(`Failed to get executions: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    const unwrapped = this.unwrapData(data);
    const jobs = unwrapped.jobs ?? [];
    return jobs.filter((job) => job.status === "running" || job.status === "pending");
  }
  /**
   * Get cron jobs
   */
  async getCronJobs() {
    const response = await fetch(`${this.baseUrl}/api/v1/cron`);
    if (!response.ok) {
      throw new Error(`Failed to get cron jobs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse(response);
    return this.unwrapData(data);
  }
  /**
   * Submit a job for execution
   */
  async submitJob(params) {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: params.handler,
        payload: params.input,
        priority: params.priority
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to submit job: ${response.statusText}`);
    }
    const payload = await this.parseJsonResponse(response);
    const data = this.unwrapData(payload);
    return { id: data.jobId, status: "pending" };
  }
  /**
   * Run workflow by ID
   */
  async runWorkflow(workflowId, request = {}) {
    const response = await fetch(
      `${this.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to run workflow: ${response.statusText}`);
    }
    const payload = await this.parseJsonResponse(response);
    return this.unwrapData(payload);
  }
};

// src/commands/list.ts
var list_default = defineCommand({
  id: "workflow:list",
  description: "List active workflow executions",
  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Workflow listing with filtering (status/type), JSON/human output formats, run state formatting, and error handling
    async execute(ctx, input) {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      const statusFilter = flags.status;
      const typeFilter = flags.type;
      try {
        const client = new WorkflowDaemonClient();
        if (typeFilter === "cron") {
          const result = await client.getCronJobs();
          const cronJobs = result.crons ?? [];
          if (outputJson) {
            ctx.ui?.json?.({ ok: true, data: result });
          } else {
            if (cronJobs.length === 0) {
              ctx.ui?.warn?.("No cron jobs found");
              ctx.ui?.info?.("");
              ctx.ui?.info?.("To add cron jobs:");
              ctx.ui?.info?.('  1. Plugin manifests: Add "cron" section to manifest.ts');
              ctx.ui?.info?.("  2. User YAML: Create .kb/jobs/*.yml files");
            } else {
              const jobItems = cronJobs.map((job) => {
                const parts = [
                  `ID: ${job.id}`,
                  `Schedule: ${job.schedule} (${job.timezone || "UTC"})`,
                  `Enabled: ${job.enabled ? "Yes" : "No"}`,
                  `Type: ${job.jobType || "unknown"}`
                ];
                return parts.join(" | ");
              });
              const summaryItems = [
                `Total Jobs: ${cronJobs.length}`
              ];
              ctx.ui?.success?.("Cron Jobs", {
                title: "Workflow Scheduler",
                sections: [
                  { header: "Summary", items: summaryItems },
                  { header: "Registered Jobs", items: jobItems }
                ]
              });
            }
          }
          return { exitCode: 0 };
        }
        let executions = await client.getExecutions();
        if (statusFilter) {
          executions = executions.filter((exec) => exec.status === statusFilter);
        }
        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { executions } });
        } else {
          if (executions.length === 0) {
            ctx.ui?.warn?.("No active executions found");
          } else {
            const executionItems = executions.map((exec) => {
              const parts = [
                `ID: ${exec.id}`,
                `Status: ${exec.status}`,
                `Started: ${exec.startedAt || "N/A"}`
              ];
              return parts.join(" | ");
            });
            const summaryItems = [
              `Total Executions: ${executions.length}`,
              statusFilter ? `Filter: ${statusFilter}` : void 0
            ].filter(Boolean);
            ctx.ui?.success?.("Active Workflow Executions", {
              title: "Workflow Engine",
              sections: [
                { header: "Summary", items: summaryItems },
                { header: "Executions", items: executionItems }
              ]
            });
          }
        }
        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to list: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }
        return { exitCode: 1 };
      }
    }
  }
});

export { list_default as default };
//# sourceMappingURL=list.js.map
//# sourceMappingURL=list.js.map