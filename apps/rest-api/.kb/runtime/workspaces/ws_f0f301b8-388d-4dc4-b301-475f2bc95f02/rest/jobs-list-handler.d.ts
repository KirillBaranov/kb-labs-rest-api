import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface JobsListQuery {
    type?: string;
    status?: string;
    limit?: string;
    offset?: string;
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
}
interface JobListResponse {
    jobs: JobStatusInfo[];
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<JobsListQuery, unknown, unknown>, JobListResponse>;

export { _default as default };
