import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';
import { WorkflowRunRequest } from '@kb-labs/workflow-contracts';

interface WorkflowRunParams {
    id: string;
}
interface WorkflowRunResult {
    runId: string;
    status: string;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<WorkflowRunRequest, unknown, WorkflowRunParams>, WorkflowRunResult>;

export { _default as default };
