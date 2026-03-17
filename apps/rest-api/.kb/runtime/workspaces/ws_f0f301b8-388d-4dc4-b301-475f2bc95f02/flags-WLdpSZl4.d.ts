/**
 * Flags for workflow:job-run command
 */
declare const runFlags: {
    readonly json: {
        readonly type: "boolean";
        readonly description: "Output result as JSON";
        readonly default: false;
    };
    readonly handler: {
        readonly type: "string";
        readonly description: "Plugin handler to run (e.g., \"mind:rag-query\")";
    };
    readonly input: {
        readonly type: "string";
        readonly description: "JSON string of input parameters";
    };
    readonly priority: {
        readonly type: "number";
        readonly description: "Job priority (1-10, default: 5)";
    };
    readonly wait: {
        readonly type: "boolean";
        readonly description: "Wait for job completion";
        readonly default: false;
    };
};
type RunFlags = typeof runFlags;
/**
 * Flags for workflow:run command
 */
declare const workflowRunFlags: {
    readonly json: {
        readonly type: "boolean";
        readonly description: "Output result as JSON";
        readonly default: false;
    };
    readonly 'workflow-id': {
        readonly type: "string";
        readonly description: "Workflow ID to run (e.g., \"release-manager/create-release\")";
    };
    readonly input: {
        readonly type: "string";
        readonly description: "JSON string of workflow input payload";
    };
    readonly isolation: {
        readonly type: "string";
        readonly description: "Isolation profile: strict, balanced, or relaxed";
    };
    readonly 'target-namespace': {
        readonly type: "string";
        readonly description: "Execution target namespace";
    };
    readonly 'target-environment-id': {
        readonly type: "string";
        readonly description: "Execution target environment ID";
    };
    readonly 'target-workspace-id': {
        readonly type: "string";
        readonly description: "Execution target workspace ID";
    };
    readonly 'target-workdir': {
        readonly type: "string";
        readonly description: "Execution target workdir override";
    };
    readonly 'trigger-type': {
        readonly type: "string";
        readonly description: "Trigger type: manual, api, or cron";
    };
    readonly 'trigger-user': {
        readonly type: "string";
        readonly description: "Trigger user";
    };
};
type WorkflowRunFlags = typeof workflowRunFlags;

export type { RunFlags as R, WorkflowRunFlags as W };
