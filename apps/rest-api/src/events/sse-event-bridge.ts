/**
 * @module @kb-labs/rest-api/events/sse-event-bridge
 * In-memory event bridge with Server-Sent Events broadcasting support.
 */

import {
  createEventSchemaRegistry,
  type PluginEventBridge,
  type PluginEventDefinition,
  type PluginEventEnvelope,
  type PluginEventSchemaRegistry,
} from '@kb-labs/plugin-runtime'
import { randomUUID } from 'node:crypto'

export interface SseClient {
  id?: string
  runId: string | null
  write(chunk: string): void
  close?(): void
}

export interface SseEventBridgeOptions {
  bufferSize?: number
  logger?: {
    warn(message: string, meta?: Record<string, unknown>): void
    error(message: string, meta?: Record<string, unknown>): void
  }
}

const DEFAULT_BUFFER_SIZE = 500

export class SseEventBridge implements PluginEventBridge {
  private readonly registry: PluginEventSchemaRegistry
  private readonly bufferSize: number
  private readonly logger?: SseEventBridgeOptions['logger']
  private readonly buffers = new Map<string, PluginEventEnvelope[]>()
  private readonly clients = new Map<string, SseClient>()

  constructor(options: SseEventBridgeOptions = {}) {
    this.registry = createEventSchemaRegistry()
    this.bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE
    this.logger = options.logger
  }

  async emit(event: PluginEventEnvelope): Promise<void> {
    const runId = event.meta?.runId ?? event.meta?.workflowRunId
    if (!runId) {
      this.logger?.warn?.('Received workflow event without runId; skipping broadcast', {
        type: event.type,
      })
      return
    }

    const buffer = this.ensureBuffer(runId)
    buffer.push(event)
    if (buffer.length > this.bufferSize) {
      buffer.shift()
    }

    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.clients.values()) {
      if (client.runId !== null && client.runId !== runId) {
        continue
      }
      try {
        client.write(payload)
      } catch (error) {
        this.logger?.warn?.('Failed to write to SSE client', {
          error: error instanceof Error ? error.message : String(error),
        })
        this.detach(client.id!)
      }
    }
  }

  register<TPayload>(definition: PluginEventDefinition<TPayload>): void {
    this.registry.register(definition)
  }

  schemas(): PluginEventSchemaRegistry {
    return this.registry
  }

  attach(client: SseClient): string {
    const id = client.id ?? randomUUID()
    this.clients.set(id, { ...client, id })
    return id
  }

  detach(clientId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      this.clients.delete(clientId)
      client.close?.()
    }
  }

  replay(runId: string, clientId: string): void {
    const client = this.clients.get(clientId)
    if (!client) {
      return
    }
    const buffer = this.buffers.get(runId)
    if (!buffer || buffer.length === 0) {
      return
    }

    for (const event of buffer) {
      try {
        client.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch (error) {
        this.logger?.warn?.('Failed to replay events to SSE client', {
          error: error instanceof Error ? error.message : String(error),
        })
        this.detach(clientId)
        break
      }
    }
  }

  private ensureBuffer(runId: string): PluginEventEnvelope[] {
    let buffer = this.buffers.get(runId)
    if (!buffer) {
      buffer = []
      this.buffers.set(runId, buffer)
    }
    return buffer
  }
}


