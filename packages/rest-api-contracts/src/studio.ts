/**
 * @module @kb-labs/rest-api-contracts/studio
 * Studio registry types for REST API responses
 *
 * These types define the contract between REST API and Studio.
 * Studio should ONLY import from this package - no server-side dependencies.
 */

// ============================================================================
// Data Source Types (for widget data configuration)
// ============================================================================

/**
 * Data source for widget data fetching
 */
export type DataSource =
  | {
      type: 'rest';
      routeId: string;
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
    }
  | {
      type: 'mock';
      fixtureId: string;
    };

// ============================================================================
// Widget Data Types (shared between handlers and Studio widgets)
// ============================================================================

/**
 * Card data for CardList widget
 */
export interface CardData {
  title: string;
  content: string;
  status?: 'ok' | 'warn' | 'error' | 'info';
  icon?: string;
  meta?: Record<string, unknown>;
}

/**
 * CardList widget data format
 */
export interface CardListData {
  cards: CardData[];
}

/**
 * InfoPanel section data
 */
export interface InfoPanelSection {
  title: string;
  data: unknown;
  format?: 'json' | 'text' | 'keyvalue';
  collapsible?: boolean;
}

/**
 * InfoPanel widget data format
 */
export interface InfoPanelData {
  sections: InfoPanelSection[];
}

/**
 * KeyValue item data
 */
export interface KeyValueItem {
  key: string;
  value: string | number | boolean;
  type?: 'string' | 'number' | 'boolean' | 'badge';
}

/**
 * KeyValue widget data format
 */
export interface KeyValueData {
  items: KeyValueItem[];
}

// ============================================================================
// Studio Registry Types
// ============================================================================

/**
 * Widget kind enumeration
 */
export type StudioWidgetKind =
  | 'panel'
  | 'card'
  | 'cardlist'
  | 'table'
  | 'chart'
  | 'tree'
  | 'timeline'
  | 'metric'
  | 'logs'
  | 'json'
  | 'diff'
  | 'status'
  | 'progress'
  | 'infopanel'
  | 'keyvalue'
  | 'form'
  | 'input-display'
  | 'custom';

/**
 * Header hints derived from manifest header policies
 */
export interface StudioHeaderHints {
  required: string[];
  optional: string[];
  autoInjected: string[];
  deny: string[];
  sensitive: string[];
  patterns?: string[];
}

/**
 * Widget action configuration
 */
export interface StudioWidgetAction {
  id: string;
  label: string;
  type?: 'button' | 'modal' | 'link' | 'dropdown';
  icon?: string;
  variant?: 'primary' | 'default' | 'danger';
  handler?: {
    type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
    config: Record<string, unknown>;
  };
  confirm?: {
    title: string;
    description: string;
  };
  disabled?: boolean | string;
  visible?: boolean | string;
  order?: number;
}

/**
 * Widget event bus configuration
 */
export interface StudioWidgetEvents {
  emit?: string[];
  subscribe?: string[];
}

/**
 * Widget layout hint
 */
export interface StudioLayoutHint {
  w?: number;
  h?: number;
  minW?: number;
  minH?: number;
  height?: 'auto' | number | 'fit-content';
}

/**
 * Plugin metadata attached to registry entries
 */
export interface StudioPluginMeta {
  id: string;
  version: string;
  displayName?: string;
}

/**
 * Studio registry entry (widget)
 */
export interface StudioRegistryEntry {
  id: string;
  kind: StudioWidgetKind;
  component?: string;
  title?: string;
  description?: string;
  data?: {
    source?: DataSource;
    schema?: unknown;
    headers?: StudioHeaderHints;
  };
  options?: Record<string, unknown>;
  pollingMs?: number;
  order?: number;
  layoutHint?: StudioLayoutHint;
  actions?: StudioWidgetAction[];
  events?: StudioWidgetEvents;
  plugin: StudioPluginMeta;
}

/**
 * Studio menu entry
 */
export interface StudioMenuEntry {
  id: string;
  label: string;
  target: string;
  order?: number;
  plugin: StudioPluginMeta;
}

/**
 * Studio layout entry
 */
export interface StudioLayoutEntry {
  id: string;
  name: string;
  template: string;
  kind?: 'grid' | 'two-pane';
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
  widgets?: string[];
  actions?: StudioWidgetAction[];
  plugin: StudioPluginMeta;
}

/**
 * Plugin registry entry (grouped by plugin)
 */
export interface StudioPluginEntry {
  id: string;
  version: string;
  displayName?: string;
  widgets: StudioRegistryEntry[];
  menus: StudioMenuEntry[];
  layouts: StudioLayoutEntry[];
}

/**
 * Complete Studio registry response
 */
export interface StudioRegistry {
  schema: 'kb.studio-registry/1';
  registryVersion?: string;
  generatedAt?: string;
  plugins: StudioPluginEntry[];
  widgets: StudioRegistryEntry[];
  menus: StudioMenuEntry[];
  layouts: StudioLayoutEntry[];
}

// ============================================================================
// REST API Response Types
// ============================================================================

/**
 * GET /studio/registry response
 */
export type StudioRegistryResponse = StudioRegistry;
