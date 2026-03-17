import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { RestInput } from '@kb-labs/sdk';

interface RunsListQuery {
    status?: string;
    limit?: string;
    offset?: string;
}
declare const _default: _kb_labs_shared_command_kit.Handler<unknown, RestInput<RunsListQuery, unknown, unknown>, unknown>;

export { _default as default };
