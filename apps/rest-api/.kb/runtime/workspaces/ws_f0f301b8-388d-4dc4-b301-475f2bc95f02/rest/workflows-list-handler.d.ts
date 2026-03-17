import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';
import { WorkflowListResponse } from '@kb-labs/workflow-contracts';

interface WorkflowsListQuery {
    source?: string;
    status?: string;
    tags?: string;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<WorkflowsListQuery, unknown, unknown>, WorkflowListResponse>;

export { _default as default };
