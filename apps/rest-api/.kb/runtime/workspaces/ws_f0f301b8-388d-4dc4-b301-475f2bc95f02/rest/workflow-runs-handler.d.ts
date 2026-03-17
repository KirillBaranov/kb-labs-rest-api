import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';
import { WorkflowRunHistoryResponse } from '@kb-labs/workflow-contracts';

declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<{
    limit?: string;
    offset?: string;
    status?: string;
}, unknown, {
    id: string;
}>, WorkflowRunHistoryResponse>;

export { _default as default };
