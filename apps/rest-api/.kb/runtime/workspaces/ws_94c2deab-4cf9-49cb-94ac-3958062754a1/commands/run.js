import { defineCommand, useLoader } from '@kb-labs/sdk';

// src/commands/run.ts

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

// src/commands/run.ts
var run_default = defineCommand({
  id: "workflow:job-run",
  description: "Submit a raw job for execution",
  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Workflow execution with input parsing, validation, wait mode (polling + websocket logs), JSON/human output, and error handling
    async execute(ctx, input) {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      const handler = flags.handler;
      const inputStr = flags.input;
      const priority = flags.priority ?? 5;
      const wait = flags.wait ?? false;
      if (!handler) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: "Missing required flag: --handler" });
        } else {
          ctx.ui?.error?.("Missing required flag: --handler");
          ctx.ui?.info?.("Usage: kb workflow job-run --handler=<handler> [--input=<json>]");
          ctx.ui?.info?.(`Example: kb workflow job-run --handler=mind:rag-query --input='{"text":"test"}'`);
        }
        return { exitCode: 1 };
      }
      let parsedInput;
      if (inputStr) {
        try {
          parsedInput = JSON.parse(inputStr);
        } catch (error) {
          if (outputJson) {
            ctx.ui?.json?.({ ok: false, error: "Invalid JSON in --input flag" });
          } else {
            ctx.ui?.error?.("Invalid JSON in --input flag");
            ctx.ui?.info?.(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
          return { exitCode: 1 };
        }
      }
      try {
        const client = new WorkflowDaemonClient();
        const loader = useLoader("Submitting job...");
        loader.start();
        const result = await client.submitJob({
          handler,
          input: parsedInput,
          priority
        });
        loader.succeed("Job submitted");
        if (wait) {
          const waitLoader = useLoader("Waiting for job completion...");
          waitLoader.start();
          let maxAttempts = 60;
          while (maxAttempts > 0) {
            await new Promise((resolve) => setTimeout(resolve, 2e3));
            const status = await client.getJobStatus(result.id);
            if (status.status === "completed") {
              waitLoader.succeed("Job completed");
              break;
            } else if (status.status === "failed") {
              waitLoader.fail("Job failed");
              if (outputJson) {
                ctx.ui?.json?.({ ok: false, error: "Job execution failed", jobId: result.id });
              } else {
                ctx.ui?.error?.("Job execution failed");
                ctx.ui?.info?.(`Job ID: ${result.id}`);
              }
              return { exitCode: 1 };
            }
            maxAttempts--;
          }
          if (maxAttempts === 0) {
            waitLoader.fail("Timeout waiting for job completion");
          }
        }
        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          const resultItems = [
            `Job ID: ${result.id}`,
            `Status: ${result.status}`,
            `Handler: ${handler}`,
            `Priority: ${priority}`
          ];
          if (parsedInput) {
            resultItems.push(`Input: ${JSON.stringify(parsedInput)}`);
          }
          ctx.ui?.success?.("Job Submitted Successfully", {
            title: "Workflow Engine",
            sections: [{ header: "Details", items: resultItems }]
          });
        }
        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to submit job: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }
        return { exitCode: 1 };
      }
    }
  }
});

export { run_default as default };
//# sourceMappingURL=run.js.map
//# sourceMappingURL=run.js.map