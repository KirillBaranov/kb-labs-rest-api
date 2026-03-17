import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { W as WorkflowRunFlags } from '../flags-WLdpSZl4.js';

type WorkflowRunInput = WorkflowRunFlags & {
    argv?: string[];
};
declare const _default: _kb_labs_shared_command_kit.CommandHandlerV3<unknown, WorkflowRunInput, {
    exitCode: number;
}>;

export { _default as default };
