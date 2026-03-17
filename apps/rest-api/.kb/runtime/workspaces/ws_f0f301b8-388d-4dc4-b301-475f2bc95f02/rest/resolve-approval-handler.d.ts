import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface ResolveApprovalParams {
    runId: string;
}
interface ResolveApprovalBody {
    jobId: string;
    stepId: string;
    action: 'approve' | 'reject';
    comment?: string;
    data?: Record<string, unknown>;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<unknown, ResolveApprovalBody, ResolveApprovalParams>, unknown>;

export { _default as default };
