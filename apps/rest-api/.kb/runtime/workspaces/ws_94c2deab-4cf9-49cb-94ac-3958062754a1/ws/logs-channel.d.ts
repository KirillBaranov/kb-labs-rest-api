import * as _kb_labs_plugin_contracts from '@kb-labs/plugin-contracts';
import { LogRecord } from '@kb-labs/core-platform';

declare const subscriptions: Map<string, () => void>;
/**
 * Convert LogRecord level to channel level type
 */
declare function normalizeLevel(level: LogRecord['level']): 'info' | 'warn' | 'error' | 'debug';
/**
 * Check if log level matches filter
 */
declare function levelMatches(logLevel: LogRecord['level'], filterLevel?: string): boolean;
declare const _default: {
    execute(context: _kb_labs_plugin_contracts.PluginContextV3<unknown>, input: _kb_labs_plugin_contracts.WSInput): Promise<_kb_labs_plugin_contracts.CommandResult | void>;
};

export { _default as default, levelMatches, normalizeLevel, subscriptions };
