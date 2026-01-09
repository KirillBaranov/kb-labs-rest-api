/**
 * @module @kb-labs/rest-api-app/services/incident-storage
 * Incident history storage service
 */

import type { CacheAdapter } from '@kb-labs/plugin-contracts';

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'critical' | 'warning' | 'info';

/**
 * Incident type categories
 */
export type IncidentType =
  | 'error_rate'
  | 'latency_spike'
  | 'plugin_failure'
  | 'adapter_failure'
  | 'system_health'
  | 'custom';

/**
 * Incident record structure
 */
export interface Incident {
  /** Unique incident identifier */
  id: string;
  /** Incident type */
  type: IncidentType;
  /** Severity level */
  severity: IncidentSeverity;
  /** Incident title/summary */
  title: string;
  /** Detailed description */
  details: string;
  /** Root cause analysis (optional) */
  rootCause?: string;
  /** Affected services/plugins */
  affectedServices?: string[];
  /** Timestamp when incident occurred (Unix ms) */
  timestamp: number;
  /** Timestamp when incident was resolved (Unix ms) */
  resolvedAt?: number;
  /** Resolution notes */
  resolutionNotes?: string;
  /** Related metrics/logs */
  metadata?: Record<string, unknown>;
}

/**
 * Incident create payload (omit id, we generate it)
 */
export type IncidentCreatePayload = Omit<Incident, 'id'>;

/**
 * Incident query options
 */
export interface IncidentQueryOptions {
  /** Maximum number of incidents to return (default: 50) */
  limit?: number;
  /** Filter by severity */
  severity?: IncidentSeverity | IncidentSeverity[];
  /** Filter by type */
  type?: IncidentType | IncidentType[];
  /** Filter by time range (from timestamp) */
  from?: number;
  /** Filter by time range (to timestamp) */
  to?: number;
  /** Include resolved incidents (default: false) */
  includeResolved?: boolean;
}

/**
 * Incident storage service configuration
 */
export interface IncidentStorageConfig {
  /** TTL for incidents in milliseconds (default: 30 days) */
  ttlMs?: number;
  /** Maximum incidents to store (default: 1000) */
  maxIncidents?: number;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<IncidentStorageConfig> = {
  ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxIncidents: 1000,
  debug: false,
};

/**
 * Incident storage service
 *
 * Stores incident history in platform.cache with TTL-based retention.
 * Provides CRUD operations and query filtering.
 */
export class IncidentStorage {
  private cache: CacheAdapter;
  private config: Required<IncidentStorageConfig>;
  private logger: Console | any;
  private readonly CACHE_KEY = 'incidents:history';

  constructor(cache: CacheAdapter, config: IncidentStorageConfig = {}, logger: Console | any = console) {
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Create a new incident record
   */
  async createIncident(payload: IncidentCreatePayload): Promise<Incident> {
    // Generate unique ID
    const id = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const incident: Incident = {
      id,
      ...payload,
      timestamp: payload.timestamp ?? Date.now(),
    };

    // Validate required fields
    if (!incident.type || !incident.severity || !incident.title) {
      throw new Error('Incident must have type, severity, and title');
    }

    // Get existing incidents
    let incidents = await this.getAllIncidents();

    // Add new incident
    incidents.unshift(incident); // newest first

    // Trim to max limit
    if (incidents.length > this.config.maxIncidents) {
      incidents = incidents.slice(0, this.config.maxIncidents);
    }

    // Store back with TTL
    await this.cache.set(this.CACHE_KEY, incidents, this.config.ttlMs);

    this.log('info', 'Incident created', {
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
    });

    return incident;
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    const incidents = await this.getAllIncidents();
    return incidents.find(inc => inc.id === id) ?? null;
  }

  /**
   * Query incidents with filters
   */
  async queryIncidents(options: IncidentQueryOptions = {}): Promise<Incident[]> {
    const {
      limit = 50,
      severity,
      type,
      from,
      to,
      includeResolved = false,
    } = options;

    let incidents = await this.getAllIncidents();

    // Filter by severity
    if (severity) {
      const severityList = Array.isArray(severity) ? severity : [severity];
      incidents = incidents.filter(inc => severityList.includes(inc.severity));
    }

    // Filter by type
    if (type) {
      const typeList = Array.isArray(type) ? type : [type];
      incidents = incidents.filter(inc => typeList.includes(inc.type));
    }

    // Filter by time range
    if (from) {
      incidents = incidents.filter(inc => inc.timestamp >= from);
    }
    if (to) {
      incidents = incidents.filter(inc => inc.timestamp <= to);
    }

    // Filter resolved incidents
    if (!includeResolved) {
      incidents = incidents.filter(inc => !inc.resolvedAt);
    }

    // Apply limit
    return incidents.slice(0, limit);
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(id: string, resolutionNotes?: string): Promise<Incident | null> {
    const incidents = await this.getAllIncidents();
    const index = incidents.findIndex(inc => inc.id === id);

    if (index === -1) {
      return null;
    }

    incidents[index]!.resolvedAt = Date.now();
    if (resolutionNotes) {
      incidents[index]!.resolutionNotes = resolutionNotes;
    }

    // Store back
    await this.cache.set(this.CACHE_KEY, incidents, this.config.ttlMs);

    this.log('info', 'Incident resolved', {
      id,
      resolvedAt: incidents[index]!.resolvedAt,
    });

    return incidents[index]!;
  }

  /**
   * Delete an incident
   */
  async deleteIncident(id: string): Promise<boolean> {
    const incidents = await this.getAllIncidents();
    const initialLength = incidents.length;
    const filtered = incidents.filter(inc => inc.id !== id);

    if (filtered.length === initialLength) {
      return false; // Not found
    }

    await this.cache.set(this.CACHE_KEY, filtered, this.config.ttlMs);

    this.log('info', 'Incident deleted', { id });

    return true;
  }

  /**
   * Get statistics about stored incidents
   */
  async getStats(): Promise<{
    total: number;
    bySeverity: Record<IncidentSeverity, number>;
    byType: Record<string, number>;
    resolved: number;
    unresolved: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    const incidents = await this.getAllIncidents();

    const stats = {
      total: incidents.length,
      bySeverity: {
        critical: 0,
        warning: 0,
        info: 0,
      } as Record<IncidentSeverity, number>,
      byType: {} as Record<string, number>,
      resolved: 0,
      unresolved: 0,
      oldestTimestamp: null as number | null,
      newestTimestamp: null as number | null,
    };

    for (const incident of incidents) {
      stats.bySeverity[incident.severity]++;

      stats.byType[incident.type] = (stats.byType[incident.type] ?? 0) + 1;

      if (incident.resolvedAt) {
        stats.resolved++;
      } else {
        stats.unresolved++;
      }
    }

    if (incidents.length > 0) {
      stats.oldestTimestamp = incidents[incidents.length - 1]!.timestamp;
      stats.newestTimestamp = incidents[0]!.timestamp;
    }

    return stats;
  }

  /**
   * Clear all incidents (admin function)
   */
  async clearAll(): Promise<void> {
    await this.cache.delete(this.CACHE_KEY);
    this.log('warn', 'All incidents cleared');
  }

  /**
   * Get all incidents from cache (internal helper)
   */
  private async getAllIncidents(): Promise<Incident[]> {
    const incidents = await this.cache.get<Incident[]>(this.CACHE_KEY);
    if (!incidents || !Array.isArray(incidents)) {
      return [];
    }
    return incidents;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any): void {
    if (level === 'debug' && !this.config.debug) return;

    if (this.logger[level]) {
      this.logger[level](`[IncidentStorage] ${message}`, meta);
    } else {
      console.log(`[IncidentStorage] [${level}] ${message}`, meta);
    }
  }
}
