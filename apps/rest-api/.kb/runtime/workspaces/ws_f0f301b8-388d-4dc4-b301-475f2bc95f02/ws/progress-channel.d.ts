import * as _kb_labs_plugin_contracts from '@kb-labs/plugin-contracts';

/**
 * @module @kb-labs/workflow-cli/ws/progress-channel
 * WebSocket channel for real-time job progress updates
 */
declare const _default: {
    execute(context: _kb_labs_plugin_contracts.PluginContextV3<unknown>, input: _kb_labs_plugin_contracts.WSInput): Promise<_kb_labs_plugin_contracts.CommandResult | void>;
};

export { _default as default };
