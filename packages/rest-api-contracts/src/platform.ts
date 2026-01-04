import type { SuccessEnvelope } from './envelopes';

/**
 * Platform configuration snapshot.
 * Returns current platform adapters and their options (redacted for sensitive data).
 */
export interface PlatformConfigPayload {
  schema: 'kb.platform.config/1';
  ts: string;
  adapters: Record<string, string | null>;
  adapterOptions: Record<string, unknown>;
  execution: {
    mode: string;
  };
  /** List of keys that were redacted from adapterOptions */
  redacted: string[];
}

export type PlatformConfigResponse = SuccessEnvelope<PlatformConfigPayload>;
