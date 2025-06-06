import { ApiResponse, ConfigPreset, InstanceDetail, InstanceHealth, MCPConfig, ServerDetail, ServerListResponse, ServerSummary, SystemMetrics, SystemStatus, Tool, ToolDetail } from "./types";

// Base API URL - in a real app, this would be in an environment variable
// Using relative path so frontend and backend can work under the same domain, avoiding CORS issues
const API_BASE_URL = "";

// Helper function for making API requests
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  console.log(`Fetching API: ${url}`, options);

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      // Try to parse error response
      const errorText = await response.text();
      let errorObj = {};

      try {
        errorObj = JSON.parse(errorText);
        console.error(`API Error (${response.status}):`, errorObj);
      } catch (e) {
        // If not JSON, use the original text
        console.error(`API Error (${response.status}):`, errorText);
      }

      throw new Error(
        errorObj.message ||
        errorObj.error?.message ||
        `API Error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log(`API Response from ${endpoint}:`, data);
    return data as T;
  } catch (error) {
    console.error(`API Request Failed for ${endpoint}:`, error);
    throw error;
  }
}

// Server Management API
export const serversApi = {
  // Get all servers
  getAll: async (): Promise<ServerListResponse> => {
    try {
      const response = await fetchApi<ServerListResponse>("/api/mcp/servers");

      // 确保响应数据结构匹配 ServerListResponse
      if (!response || !response.servers) {
        // 如果不匹配，构造一个符合预期的响应格式
        console.warn("API response doesn't match expected format, normalizing:", response);
        return {
          servers: Array.isArray(response) ? response :
                  response && typeof response === 'object' && Object.keys(response).length ?
                  [response as ServerSummary] : []
        };
      }

      // 确保所有服务器对象都有有效的状态值和其他必要字段
      const normalizedServers = response.servers.map(server => ({
        ...server,
        name: server.name || `server-${Math.random().toString(36).substring(2, 9)}`,
        status: server.status || 'unknown',
        kind: server.kind || server.server_type || 'unknown',
        instance_count: server.instance_count || 0,
        // 确保 instances 数组存在并包含实例状态
        instances: server.instances || []
      }));

      // 尝试为没有实例数据的服务器获取实例
      for (let i = 0; i < normalizedServers.length; i++) {
        const server = normalizedServers[i];
        if (!server.instances || server.instances.length === 0) {
          try {
            // 获取服务器详情以获取实例
            if (server.instance_count && server.instance_count > 0) {
              console.log(`Fetching instances for server ${server.name}`);
              const serverDetail = await fetchApi<ServerDetail>(`/api/mcp/servers/${server.name}`);
              if (serverDetail.instances && serverDetail.instances.length > 0) {
                normalizedServers[i].instances = serverDetail.instances;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch instances for server ${server.name}:`, err);
          }
        }
      }

      return { servers: normalizedServers };
    } catch (error) {
      console.error("Failed to fetch servers:", error);
      // 返回一个空的响应结构而不是抛出错误，这样UI不会崩溃
      return { servers: [] };
    }
  },

  // Get server details
  getServer: async (name: string): Promise<ServerDetail> => {
    try {
      const response = await fetchApi<ServerDetail>(`/api/mcp/servers/${name}`);

      // 确保 instances 数组存在
      if (!response.instances) {
        response.instances = [];
      }

      return response;
    } catch (error) {
      console.error(`Error fetching server details for ${name}:`, error);
      // 返回一个基本的空服务器详情对象而不是抛出错误
      return {
        name,
        status: "error",
        kind: "unknown",
        instances: []
      };
    }
  },

  // Get all instances for a server
  getInstances: (serverName: string) =>
    fetchApi<InstanceSummary[]>(`/api/mcp/servers/${serverName}/instances`),

  // Get instance details
  getInstance: async (serverName: string, instanceId: string): Promise<InstanceDetail> => {
    try {
      const response = await fetchApi<InstanceDetail>(`/api/mcp/servers/${serverName}/instances/${instanceId}`);

      // 确保响应包含必要的字段
      return {
        id: response.id || instanceId,
        name: response.name || instanceId,
        server_name: response.server_name || serverName,
        status: response.status || 'unknown',
        allowed_operations: response.allowed_operations || [],
        details: response.details || {
          connection_attempts: 0,
          tools_count: 0,
          server_type: 'unknown',
        }
      };
    } catch (error) {
      console.error(`Error fetching instance details for ${serverName}/${instanceId}:`, error);
      // 返回一个基本的实例详情对象而不是抛出错误
      return {
        id: instanceId,
        name: instanceId,
        server_name: serverName,
        status: 'error',
        allowed_operations: [],
        details: {
          connection_attempts: 0,
          tools_count: 0,
          server_type: 'unknown',
          error_message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  },

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

  // The following are new server management features (mock implementation)

  // Enable server
  enableServer: async (serverName: string, sync?: boolean) => {
    try {
      const url = sync
        ? `/api/mcp/servers/${serverName}/enable?sync=true`
        : `/api/mcp/servers/${serverName}/enable`;
      return await fetchApi<ApiResponse<null>>(url, {
        method: "POST"
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      return {
        status: "success",
        message: `Server ${serverName} enabled successfully (mock)${sync ? ' with sync' : ''}`
      };
    }
  },

  // Disable server
  disableServer: async (serverName: string, sync?: boolean) => {
    try {
      const url = sync
        ? `/api/mcp/servers/${serverName}/disable?sync=true`
        : `/api/mcp/servers/${serverName}/disable`;
      return await fetchApi<ApiResponse<null>>(url, {
        method: "POST"
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      return {
        status: "success",
        message: `Server ${serverName} disabled successfully (mock)${sync ? ' with sync' : ''}`
      };
    }
  },

  // Reconnect all instances of a server
  reconnectAllInstances: async (serverName: string) => {
    try {
      return await fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}/reconnect`, {
        method: "POST"
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      return {
        status: "success",
        message: `All instances of server ${serverName} reconnected successfully (mock)`
      };
    }
  },

  // Create new server
  createServer: async (serverConfig: Partial<MCPServerConfig>) => {
    try {
      return await fetchApi<ApiResponse<ServerSummary>>(`/api/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(serverConfig)
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      const mockServer: ServerSummary = {
        name: serverConfig.name || `server-${Date.now()}`,
        kind: serverConfig.kind || "stdio",
        status: "initializing",
        instance_count: 0
      };
      return {
        status: "success",
        message: `Server ${mockServer.name} created successfully (mock)`,
        data: mockServer
      };
    }
  },

  // Update server configuration
  updateServer: async (serverName: string, serverConfig: Partial<MCPServerConfig>) => {
    try {
      return await fetchApi<ApiResponse<ServerSummary>>(`/api/mcp/servers/${serverName}`, {
        method: "PUT",
        body: JSON.stringify(serverConfig)
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      return {
        status: "success",
        message: `Server ${serverName} updated successfully (mock)`,
        data: {
          name: serverName,
          kind: serverConfig.kind || "stdio",
          status: "connected",
          instance_count: 1
        }
      };
    }
  },

  // Delete server
  deleteServer: async (serverName: string) => {
    try {
      return await fetchApi<ApiResponse<null>>(`/api/mcp/servers/${serverName}`, {
        method: "DELETE"
      });
    } catch (error) {
      console.warn("API not available, using mock implementation:", error);
      // Simulate successful response
      return {
        status: "success",
        message: `Server ${serverName} deleted successfully (mock)`
      };
    }
  }
};

// 定义工具类型
interface SuitTool {
  id: string;
  name?: string;
  tool_name?: string; // 后端可能使用 tool_name 而不是 name
  server_name: string;
  description?: string;
  enabled?: boolean;
  is_enabled?: boolean; // 后端可能使用 is_enabled 而不是 enabled
}

// Tools Management API
export const toolsApi = {
  // Get all tools
  getAll: async () => {
    try {
      // 尝试从配置套件中获取工具列表
      const suitsResponse = await toolsApi.getSuits();
      if (suitsResponse?.suits?.length > 0) {
        const activeSuitId = suitsResponse.suits[0].id;
        try {
          // 获取配置套件中的工具列表
          const suitToolsResponse = await fetchApi<{ tools: SuitTool[] }>(`/api/mcp/suits/${activeSuitId}/tools`);
          if (suitToolsResponse?.tools) {
            // 将后端返回的工具数组转换为前端期望的格式
            const tools = suitToolsResponse.tools.map(tool => {
              // 确保每个工具都有唯一的 ID
              const toolId = tool.id || "";

              // 确定工具名称 - 优先使用 tool_name，然后是 name
              const toolName = tool.tool_name || tool.name || "";

              // 确定工具启用状态 - 优先使用 is_enabled，然后是 enabled
              const isEnabled = tool.is_enabled !== undefined ? tool.is_enabled :
                               (tool.enabled !== undefined ? tool.enabled : true);

              return {
                tool_name: toolName,
                server_name: tool.server_name || "",
                is_enabled: isEnabled,
                description: tool.description || "",
                tool_id: toolId
              };
            });

            console.log("Fetched tools from suit:", tools);
            return { tools };
          }
        } catch (suitToolsError) {
          console.error("Failed to fetch suit tools:", suitToolsError);
        }
      }

      // 如果无法从配置套件获取工具列表，则回退到旧方法
      const response = await fetchApi<{ name: string; tool_name?: string; description?: string; id?: string; server_name?: string }[]>("/api/mcp/specs/tools");

      // 将后端返回的数组转换为前端期望的格式
      const tools = response.map(tool => {
        // 确定服务器名称
        let serverName = tool.server_name || "";

        // 如果没有直接的 server_name，尝试从描述中提取
        if (!serverName && tool.description) {
          serverName = tool.description.includes("server '") ?
            tool.description.split("server '")[1].split("'")[0] : "";
        }

        // 确定工具名称 - 优先使用 tool_name，然后是 name
        const toolName = tool.tool_name || tool.name || "";

        // 确保每个工具都有唯一的 ID
        const toolId = tool.id || `${serverName}_${toolName}`;

        return {
          tool_name: toolName,
          server_name: serverName,
          is_enabled: true, // 后端只返回已启用的工具
          description: tool.description || "",
          tool_id: toolId
        };
      });

      console.log("Fetched tools from specs:", tools);
      return { tools };
    } catch (error) {
      console.error("Failed to fetch tools:", error);
      return { tools: [] };
    }
  },

  // Get available suits
  getSuits: async () => {
    try {
      return await fetchApi<{ suits: { id: string; name: string }[] }>("/api/mcp/suits");
    } catch (error) {
      console.error("Failed to fetch suits:", error);
      return { suits: [] };
    }
  },

  // Get tools in a suit
  getSuitTools: async (suitId: string) => {
    try {
      return await fetchApi<{ tools: SuitTool[] }>(`/api/mcp/suits/${suitId}/tools`);
    } catch (error) {
      console.error(`Failed to fetch tools for suit ${suitId}:`, error);
      return { tools: [] };
    }
  },

  // Get tool details
  getTool: (serverName: string, toolName: string) =>
    fetchApi<ToolDetail>(`/api/mcp/specs/tools/${serverName}/${toolName}`),

  // Update tool configuration
  updateTool: (serverName: string, toolName: string, config: Partial<ToolDetail>) =>
    fetchApi<ApiResponse<ToolDetail>>(`/api/mcp/specs/tools/${serverName}/${toolName}`, {
      method: "POST",
      body: JSON.stringify(config),
    }),

  // Enable tool
  enableTool: async (suitId: string, suitToolId: string) => {
    try {
      // 使用正确的 API 端点
      return await fetchApi<ApiResponse<null>>(`/api/mcp/suits/${suitId}/tools/${suitToolId}/enable`, {
        method: "POST",
      });
    } catch (error) {
      console.warn("Enable tool API not available, using mock implementation:", error);
      // 模拟成功响应
      return {
        status: "success",
        message: `Tool ${suitToolId} enabled successfully (mock)`
      };
    }
  },

  // Disable tool
  disableTool: async (suitId: string, suitToolId: string) => {
    try {
      // 使用正确的 API 端点
      return await fetchApi<ApiResponse<null>>(`/api/mcp/suits/${suitId}/tools/${suitToolId}/disable`, {
        method: "POST",
      });
    } catch (error) {
      console.warn("Disable tool API not available, using mock implementation:", error);
      // 模拟成功响应
      return {
        status: "success",
        message: `Tool ${suitToolId} disabled successfully (mock)`
      };
    }
  },
};

// System Management API
export const systemApi = {
  // Get system status
  getStatus: () => fetchApi<SystemStatus>("/api/system/status"),

  // Get system metrics
  getMetrics: () => fetchApi<SystemMetrics>("/api/system/metrics"),
};

// 导入全局设置类型
import { GlobalSettings } from './types';

// Mock data for configuration
const mockGlobalSettings: GlobalSettings = {
  max_concurrent_connections: 10,
  request_timeout_ms: 30000,
  enable_metrics: true,
  log_level: "info",
};

const mockConfig: MCPConfig = {
  servers: [],
  tools: [],
  global_settings: mockGlobalSettings,
};

const mockPresets: ConfigPreset[] = [
  {
    id: "default",
    name: "Default Configuration",
    description: "Default system configuration",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    config: mockConfig,
  },
];

// Configuration Management API
export const configApi = {
  // Get current active configuration
  getCurrentConfig: async () => {
    try {
      return await fetchApi<MCPConfig>("/api/config/current");
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);

      // Return mock config with empty servers and tools
      // We'll populate it with real data if available
      const config = { ...mockConfig };

      // Try to fetch servers
      try {
        const serversResponse = await serversApi.getAll();
        if (serversResponse && serversResponse.servers && Array.isArray(serversResponse.servers)) {
          // 创建符合 MCPServerConfig 类型的服务器配置
          config.servers = serversResponse.servers.map(server => {
            // 确保 kind 是有效的枚举值
            let serverKind: "stdio" | "sse" | "streamable_http" = "streamable_http";
            if (server.kind === "stdio" || server.kind === "sse") {
              serverKind = server.kind;
            }

            return {
              name: server.name,
              kind: serverKind,
              command: "", // 使用空字符串作为默认值
              command_path: undefined,
              args: [],
              env: {},
              max_instances: 1,
              retry_policy: {
                max_attempts: 3,
                initial_delay_ms: 1000,
                max_delay_ms: 10000,
                backoff_multiplier: 1.5,
              },
            };
          });
        }
      } catch (e) {
        console.error("Failed to fetch servers for mock config:", e);
      }

      // Try to fetch tools
      try {
        const toolsResponse = await toolsApi.getAll();
        if (toolsResponse && toolsResponse.tools && Array.isArray(toolsResponse.tools)) {
          config.tools = toolsResponse.tools.map(tool => ({
            name: tool.tool_name,
            server_name: tool.server_name,
            is_enabled: tool.is_enabled,
            settings: {},
          }));
        }
      } catch (e) {
        console.error("Failed to fetch tools for mock config:", e);
      }

      return config;
    }
  },

  // Update current configuration
  updateConfig: async (config: MCPConfig) => {
    try {
      return await fetchApi<ApiResponse<MCPConfig>>("/api/config", {
        method: "POST",
        body: JSON.stringify(config),
      });
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      return {
        status: "success",
        message: "Configuration updated (mock)",
        data: config,
      };
    }
  },

  // Get all configuration presets
  getPresets: async () => {
    try {
      return await fetchApi<ConfigPreset[]>("/api/config/presets");
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      return mockPresets;
    }
  },

  // Get specific preset
  getPreset: async (id: string) => {
    try {
      return await fetchApi<ConfigPreset>(`/api/config/presets/${id}`);
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      const preset = mockPresets.find(p => p.id === id);
      if (!preset) {
        throw new Error(`Preset with ID ${id} not found`);
      }
      return preset;
    }
  },

  // Create new preset
  createPreset: async (preset: Omit<ConfigPreset, "id" | "created_at" | "updated_at">) => {
    try {
      return await fetchApi<ApiResponse<ConfigPreset>>("/api/config/presets", {
        method: "POST",
        body: JSON.stringify(preset),
      });
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      const newPreset: ConfigPreset = {
        ...preset,
        id: `mock-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockPresets.push(newPreset);
      return {
        status: "success",
        message: "Preset created (mock)",
        data: newPreset,
      };
    }
  },

  // Update preset
  updatePreset: async (id: string, preset: Partial<ConfigPreset>) => {
    try {
      return await fetchApi<ApiResponse<ConfigPreset>>(`/api/config/presets/${id}`, {
        method: "PUT",
        body: JSON.stringify(preset),
      });
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      const index = mockPresets.findIndex(p => p.id === id);
      if (index === -1) {
        throw new Error(`Preset with ID ${id} not found`);
      }

      const updatedPreset = {
        ...mockPresets[index],
        ...preset,
        updated_at: new Date().toISOString(),
      };

      mockPresets[index] = updatedPreset;

      return {
        status: "success",
        message: "Preset updated (mock)",
        data: updatedPreset,
      };
    }
  },

  // Delete preset
  deletePreset: async (id: string) => {
    try {
      return await fetchApi<ApiResponse<null>>(`/api/config/presets/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      const index = mockPresets.findIndex(p => p.id === id);
      if (index === -1) {
        throw new Error(`Preset with ID ${id} not found`);
      }

      mockPresets.splice(index, 1);

      return {
        status: "success",
        message: "Preset deleted (mock)",
      };
    }
  },

  // Apply preset
  applyPreset: async (id: string) => {
    try {
      return await fetchApi<ApiResponse<null>>(`/api/config/presets/${id}/apply`, {
        method: "POST",
      });
    } catch (error) {
      console.warn("Config API not available, using mock data:", error);
      const preset = mockPresets.find(p => p.id === id);
      if (!preset) {
        throw new Error(`Preset with ID ${id} not found`);
      }

      // Mark this preset as active and others as inactive
      mockPresets.forEach(p => {
        p.is_active = p.id === id;
      });

      return {
        status: "success",
        message: "Preset applied (mock)",
      };
    }
  },
};

// 定义通知数据类型
interface NotificationData {
  [key: string]: unknown;
  event?: string;
}

// WebSocket setup for notifications
export class NotificationsService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, ((data: NotificationData) => void)[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  connect() {
    if (this.ws) return;

    // 使用相对路径，避免CORS问题
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    console.log(`Connecting to WebSocket at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connection established');
        this.reconnectAttempts = 0; // 重置重连计数
      };

      this.ws.onmessage = (event) => {
        try {
          console.log('WebSocket message received:', event.data);
          const data = JSON.parse(event.data) as NotificationData;
          if (data.event) {
            const eventListeners = this.listeners.get(data.event) || [];
            console.log(`Dispatching ${data.event} event to ${eventListeners.length} listeners`);
            eventListeners.forEach(listener => listener(data));
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      this.ws.onclose = (event) => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
        this.ws = null;

        // 实现指数退避重连策略
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
          this.reconnectAttempts++;
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        } else {
          console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
        }
      };
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
    }
  }

  subscribe(event: string, callback: (data: NotificationData) => void) {
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