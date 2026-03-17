import * as _kb_labs_shared_command_kit from '@kb-labs/shared-command-kit';
import { R as RunFlags } from '../flags-WLdpSZl4.js';

type RunInput = RunFlags & {
    argv?: string[];
};
declare const _default: _kb_labs_shared_command_kit.CommandHandlerV3<unknown, RunInput, {
    exitCode: number;
}>;

export { _default as default };
