// API Response Types
export interface ServerSummary {
  id: string;
  name: string;
  kind?: string;
  server_type?: string;
  status: string;
  enabled?: boolean;
  globally_enabled?: boolean;
  enabled_in_suits?: boolean;
  instance_count?: number;
  instances?: InstanceSummary[];
}

export interface ServerListResponse {
  servers: ServerSummary[];
}

export interface InstanceSummary {
  id: string;
  name: string;
  status: string;
  startTime?: string;
  started_at?: string;
  startedAt?: string;
  lastResponseAt?: any;
}

export interface ServerDetail extends ServerSummary {
  command?: string;
  commandPath?: string;
  args?: string[];
  env?: Record<string, string>;
  instances: InstanceSummary[];
}

export interface ServerInstanceDetails {
  connection_attempts: number;
  last_connected_seconds?: number;
  tools_count: number;
  error_message?: string;
  server_type: string;
  process_id?: number;
  cpu_usage?: number;
  memory_usage?: number;
  last_health_check?: string;
}

export interface InstanceDetail {
  id: string;
  name: string;
  server_name: string;
  status: string;
  allowed_operations: string[];
  details: ServerInstanceDetails;
}

export interface InstanceHealth {
  id: string;
  name: string;
  healthy: boolean;
  message: string;
  status: string;
  checked_at: string;
  resource_metrics?: {
    cpu_usage?: number;
    memory_usage?: number;
    process_id?: number;
  };
  connection_stability?: number;
  details?: string;
}

export interface OperationResponse {
  id: string;
  name: string;
  result: string;
  status: string;
  allowed_operations: string[];
}

export interface Tool {
  tool_name: string;
  server_name: string;
  is_enabled: boolean;
  description?: string;
  tool_id?: string;
}

export interface ToolDetail extends Tool {
  configuration: Record<string, any>;
}

export interface SystemStatus {
  status: "running" | "degraded" | "stopped" | "error";
  version: string;
  uptime: number;
  active_mcp_servers: number;
  aggregated_tools_count: number;
}

export interface SystemMetrics {
  cpu_usage_percent?: number;
  memory_usage_bytes?: number;
  active_connections?: number;
  total_requests_mcp?: number;
  error_rate_mcp?: number;
  uptime_seconds?: number;
  timestamp?: string;
  connected_servers_count?: number;
  total_instances_count?: number;
  ready_instances_count?: number;
}

// API Response Status
export type ApiResponse<T> = {
  status: string;
  message?: string;
  data?: T;
};

// Notification Types
export interface ToolsChangedNotification {
  event: "tools_list_changed";
}

// UI Mode Type
export type UIMode = "wizard" | "expert";

// Theme Type
export type Theme = "light" | "dark" | "system";

// Configuration Types
export interface ConfigPreset {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  config: MCPConfig;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
  tools: MCPToolConfig[];
  global_settings: GlobalSettings;
}

export interface MCPServerConfig {
  name: string;
  kind: "stdio" | "sse" | "streamable_http";
  command?: string;
  command_path?: string;
  args?: string[];
  env?: Record<string, string>;
  max_instances?: number;
  retry_policy?: RetryPolicy;
}

export interface MCPToolConfig {
  name: string;
  server_name: string;
  is_enabled: boolean; // Keep this field name for consistency with API
  settings?: Record<string, any>;
}

export interface GlobalSettings {
  max_concurrent_connections: number;
  request_timeout_ms: number;
  enable_metrics: boolean;
  log_level: "debug" | "info" | "warn" | "error";
}

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

// Config Suits Types
export interface ConfigSuit {
  id: string;
  name: string;
  description?: string;
  suit_type: string;
  multi_select: boolean;
  priority: number;
  is_active: boolean;
  is_default: boolean;
  allowed_operations: string[];
}

export interface ConfigSuitListResponse {
  suits: ConfigSuit[];
}

export interface CreateConfigSuitRequest {
  name: string;
  description?: string;
  suit_type: string;
  multi_select?: boolean;
  priority?: number;
  is_active?: boolean;
  is_default?: boolean;
  clone_from_id?: string;
}

export interface UpdateConfigSuitRequest {
  name?: string;
  description?: string;
  suit_type?: string;
  multi_select?: boolean;
  priority?: number;
  is_active?: boolean;
  is_default?: boolean;
}

export interface ConfigSuitServer {
  id: string;
  name: string;
  enabled: boolean;
  allowed_operations: string[];
}

export interface ConfigSuitServersResponse {
  suit_id: string;
  suit_name: string;
  servers: ConfigSuitServer[];
}

export interface ConfigSuitTool {
  id: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  unique_name?: string;
  enabled: boolean;
  allowed_operations: string[];
}

export interface ConfigSuitToolsResponse {
  suit_id: string;
  suit_name: string;
  tools: ConfigSuitTool[];
}

export interface ConfigSuitResource {
  id: string;
  server_id: string;
  server_name: string;
  resource_uri: string;
  enabled: boolean;
  allowed_operations: string[];
}

export interface ConfigSuitResourcesResponse {
  suit_id: string;
  suit_name: string;
  resources: ConfigSuitResource[];
}

export interface ConfigSuitPrompt {
  id: string;
  server_id: string;
  server_name: string;
  prompt_name: string;
  enabled: boolean;
  allowed_operations: string[];
}

export interface ConfigSuitPromptsResponse {
  suit_id: string;
  suit_name: string;
  prompts: ConfigSuitPrompt[];
}

export interface BatchOperationRequest {
  ids: string[];
}

export interface BatchOperationResponse {
  success_count: number;
  successful_ids: string[];
  failed_ids: Record<string, string>;
}