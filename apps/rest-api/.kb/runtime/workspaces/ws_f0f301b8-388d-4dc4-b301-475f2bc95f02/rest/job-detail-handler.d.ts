import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface JobDetailParams {
    jobId: string;
}
interface JobStatusInfo {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    tenantId?: string;
    createdAt?: string;
    startedAt?: string;
    finishedAt?: string;
    result?: unknown;
    error?: string;
    progress?: number;
    progressMessage?: string;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<unknown, unknown, JobDetailParams>, JobStatusInfo>;

export { _default as default };
