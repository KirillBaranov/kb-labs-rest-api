import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';
import { WorkflowInfo } from '@kb-labs/workflow-contracts';

interface WorkflowDetailParams {
    id: string;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<unknown, unknown, WorkflowDetailParams>, WorkflowInfo>;

export { _default as default };
