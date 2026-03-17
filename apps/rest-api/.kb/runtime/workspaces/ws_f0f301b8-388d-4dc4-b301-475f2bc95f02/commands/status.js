import { defineCommand } from '@kb-labs/sdk';

// src/commands/status.ts

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

// src/commands/status.ts
var status_default = defineCommand({
  id: "workflow:status",
  description: "Get status of a workflow job",
  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Job status display with deep run/job/step traversal, multiple output formats (JSON/human), timing calculations, status color coding, and error aggregation
    async execute(ctx, input) {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      const jobId = flags["job-id"];
      if (!jobId) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: "Missing required flag: --job-id" });
        } else {
          ctx.ui?.error?.("Missing required flag: --job-id");
          ctx.ui?.info?.("Usage: kb workflow status --job-id=<job-id>");
        }
        return { exitCode: 1 };
      }
      try {
        const client = new WorkflowDaemonClient();
        const status = await client.getJobStatus(jobId);
        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: status });
        } else {
          const statusItems = [
            `ID: ${status.id}`,
            `Status: ${status.status}`,
            `Type: ${status.type || "N/A"}`,
            `Started: ${status.startedAt || "N/A"}`,
            `Finished: ${status.finishedAt || "N/A"}`
          ];
          if (status.error) {
            statusItems.push(`Error: ${status.error}`);
          }
          if (status.result?.summary) {
            statusItems.push(`Summary: ${status.result.summary}`);
          }
          const sections = [
            { header: "Details", items: statusItems }
          ];
          if (status.jobs && status.jobs.length > 0) {
            for (const job of status.jobs) {
              const jobItems = [
                `Status: ${job.status}`,
                `Duration: ${job.durationMs ? `${job.durationMs}ms` : "N/A"}`
              ];
              if (job.error) {
                jobItems.push(`Error: ${job.error}`);
              }
              sections.push({ header: `Job: ${job.name}`, items: jobItems });
              if (job.steps && job.steps.length > 0) {
                const stepItems = [];
                for (const step of job.steps) {
                  const statusIcon = step.status === "success" ? "\u2713" : step.status === "failed" ? "\u2717" : "\u25CB";
                  const duration = step.durationMs ? ` (${step.durationMs}ms)` : "";
                  stepItems.push(`${statusIcon} ${step.name}: ${step.status}${duration}`);
                  if (step.outputs && Object.keys(step.outputs).length > 0) {
                    const outputStr = JSON.stringify(step.outputs, null, 2);
                    const truncated = outputStr.length > 500 ? outputStr.slice(0, 500) + "..." : outputStr;
                    stepItems.push(`  \u2514\u2500 Output: ${truncated}`);
                  }
                  if (step.error) {
                    const errorMsg = typeof step.error === "object" ? step.error.message : step.error;
                    stepItems.push(`  \u2514\u2500 Error: ${errorMsg}`);
                  }
                }
                sections.push({ header: `  Steps (${job.steps.length})`, items: stepItems });
              }
            }
          }
          ctx.ui?.success?.("Job Status Retrieved", {
            title: "Workflow Job",
            sections
          });
        }
        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to get job status: ${message}`);
        }
        return { exitCode: 1 };
      }
    }
  }
});

export { status_default as default };
//# sourceMappingURL=status.js.map
//# sourceMappingURL=status.js.map