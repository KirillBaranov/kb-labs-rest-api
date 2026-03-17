import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface CronInfo {
    id: string;
    schedule: string;
    jobType: string;
    timezone?: string;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
    pluginId?: string;
}
interface CronListResponse {
    crons: CronInfo[];
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<unknown, unknown, unknown>, CronListResponse>;

export { _default as default };
