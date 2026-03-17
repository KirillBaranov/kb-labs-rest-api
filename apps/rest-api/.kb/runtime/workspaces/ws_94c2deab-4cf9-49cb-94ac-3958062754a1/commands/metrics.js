import { defineCommand } from '@kb-labs/sdk';

// src/commands/metrics.ts

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

// src/commands/metrics.ts
var metrics_default = defineCommand({
  id: "workflow:metrics",
  description: "Get workflow daemon metrics",
  handler: {
    async execute(ctx, input) {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      try {
        const client = new WorkflowDaemonClient();
        const metrics = await client.getMetrics();
        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: metrics });
        } else {
          const runsItems = [
            `Total: ${metrics.runs.total}`,
            `Queued: ${metrics.runs.queued}`,
            `Running: ${metrics.runs.running}`,
            `Completed: ${metrics.runs.completed}`,
            `Failed: ${metrics.runs.failed}`,
            `Cancelled: ${metrics.runs.cancelled}`
          ];
          const jobsItems = [
            `Total: ${metrics.jobs.total}`,
            `Queued: ${metrics.jobs.queued}`,
            `Running: ${metrics.jobs.running}`,
            `Completed: ${metrics.jobs.completed}`,
            `Failed: ${metrics.jobs.failed}`
          ];
          ctx.ui?.success?.("Workflow Metrics", {
            title: "Workflow Daemon",
            sections: [
              { header: "Runs", items: runsItems },
              { header: "Jobs", items: jobsItems }
            ]
          });
        }
        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to get metrics: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }
        return { exitCode: 1 };
      }
    }
  }
});

export { metrics_default as default };
//# sourceMappingURL=metrics.js.map
//# sourceMappingURL=metrics.js.map