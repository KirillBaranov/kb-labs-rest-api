import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface JobCancelParams {
    jobId: string;
}
interface JobCancelResponse {
    cancelled: boolean;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<unknown, unknown, JobCancelParams>, JobCancelResponse>;

export { _default as default };
