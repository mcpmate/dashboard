import { ApiResponse, ConfigPreset, InstanceDetail, InstanceHealth, MCPConfig, ServerDetail, ServerSummary, SystemMetrics, SystemStatus, Tool, ToolDetail } from "./types";

// Base API URL - in a real app, this would be in an environment variable
const API_BASE_URL = "http://localhost:8080";

// Helper function for making API requests
async function fetchApi<T>(
  endpoint: string, 
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Server Management API
export const serversApi = {
  // Get all servers
  getAll: () => fetchApi<ServerSummary[]>("/api/mcp/servers"),

  // Get server details
  getServer: (name: string) => fetchApi<ServerDetail>(`/api/mcp/servers/${name}`),

  // Get all instances for a server
  getInstances: (serverName: string) => 
    fetchApi<InstanceSummary[]>(`/api/mcp/servers/${serverName}/instances`),

  // Get instance details
  getInstance: (serverName: string, instanceId: string) => 
    fetchApi<InstanceDetail>(`/api/mcp/servers/${serverName}/instances/${instanceId}`),

  // Check instance health
  getInstanceHealth: (serverName: string, instanceId: string) => 
    fetchApi<InstanceHealth>(`/api/mcp/servers/${serverName}/instances/${instanceId}/health`),

  // Disconnect instance
  disconnectInstance: (serverName: string, instanceId: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/instances/${instanceId}/disconnect`, { 
      method: "POST" 
    }),

  // Force disconnect instance
  forceDisconnectInstance: (serverName: string, instanceId: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/instances/${instanceId}/disconnect/force`, { 
      method: "POST" 
    }),

  // Reconnect instance
  reconnectInstance: (serverName: string, instanceId: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/instances/${instanceId}/reconnect`, { 
      method: "POST" 
    }),

  // Reset and reconnect instance
  resetAndReconnectInstance: (serverName: string, instanceId: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/instances/${instanceId}/reconnect/reset`, { 
      method: "POST" 
    }),

  // Cancel initializing instance
  cancelInstance: (serverName: string, instanceId: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/instances/${instanceId}/cancel`, { 
      method: "POST" 
    }),
};

// Tools Management API
export const toolsApi = {
  // Get all tools
  getAll: () => fetchApi<Tool[]>("/api/mcp/tools"),

  // Get tool details
  getTool: (serverName: string, toolName: string) => 
    fetchApi<ToolDetail>(`/api/mcp/tools/${serverName}/${toolName}`),

  // Update tool configuration
  updateTool: (serverName: string, toolName: string, config: Partial<ToolDetail>) => 
    fetchApi<ApiResponse<ToolDetail>>(`/api/mcp/tools/${serverName}/${toolName}`, {
      method: "POST",
      body: JSON.stringify(config),
    }),

  // Enable tool
  enableTool: (serverName: string, toolName: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/tools/${serverName}/${toolName}/enable`, {
      method: "POST",
    }),

  // Disable tool
  disableTool: (serverName: string, toolName: string) => 
    fetchApi<ApiResponse<null>>(`/api/mcp/tools/${serverName}/${toolName}/disable`, {
      method: "POST",
    }),
};

// System Management API
export const systemApi = {
  // Get system status
  getStatus: () => fetchApi<SystemStatus>("/api/system/status"),

  // Get system metrics
  getMetrics: () => fetchApi<SystemMetrics>("/api/system/metrics"),
};

// Configuration Management API
export const configApi = {
  // Get current active configuration
  getCurrentConfig: () => fetchApi<MCPConfig>("/api/config/current"),

  // Update current configuration
  updateConfig: (config: MCPConfig) => 
    fetchApi<ApiResponse<MCPConfig>>("/api/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  // Get all configuration presets
  getPresets: () => fetchApi<ConfigPreset[]>("/api/config/presets"),

  // Get specific preset
  getPreset: (id: string) => fetchApi<ConfigPreset>(`/api/config/presets/${id}`),

  // Create new preset
  createPreset: (preset: Omit<ConfigPreset, "id" | "created_at" | "updated_at">) => 
    fetchApi<ApiResponse<ConfigPreset>>("/api/config/presets", {
      method: "POST",
      body: JSON.stringify(preset),
    }),

  // Update preset
  updatePreset: (id: string, preset: Partial<ConfigPreset>) => 
    fetchApi<ApiResponse<ConfigPreset>>(`/api/config/presets/${id}`, {
      method: "PUT",
      body: JSON.stringify(preset),
    }),

  // Delete preset
  deletePreset: (id: string) => 
    fetchApi<ApiResponse<null>>(`/api/config/presets/${id}`, {
      method: "DELETE",
    }),

  // Apply preset
  applyPreset: (id: string) => 
    fetchApi<ApiResponse<null>>(`/api/config/presets/${id}/apply`, {
      method: "POST",
    }),
};

// Mock WebSocket setup for notifications
export class NotificationsService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  connect() {
    if (this.ws) return;
    
    this.ws = new WebSocket(`ws://${API_BASE_URL.replace('http://', '')}/ws`);
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event) {
          const eventListeners = this.listeners.get(data.event) || [];
          eventListeners.forEach(listener => listener(data));
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    
    this.ws.onclose = () => {
      this.ws = null;
      setTimeout(() => this.connect(), 5000);
    };
  }
  
  subscribe(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    
    if (!this.ws) {
      this.connect();
    }
    
    return () => {
      const eventListeners = this.listeners.get(event) || [];
      const index = eventListeners.indexOf(callback);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    };
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const notificationsService = new NotificationsService();