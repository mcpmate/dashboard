import type {
	ApiResponse,
	BatchOperationResponse,
	CapabilitiesKeysResponse,
	CapabilitiesStatsResponse,
	ClearCacheResponse,
	ConfigPreset,
	ConfigSuit,
	ConfigSuitListResponse,
	ConfigSuitPromptsResponse,
	ConfigSuitResourcesResponse,
	ConfigSuitServersResponse,
	ConfigSuitToolsResponse,
	CreateConfigSuitRequest,
	InstallResponse,
	InstallRuntimeRequest,
	InstanceDetail,
	InstanceDetailsResp,
	InstanceHealth,
	InstanceHealthResp,
	InstanceListResp,
	InstanceSummary,
	MCPConfig,
	MCPServerConfig,
	OperationResponseResp,
	RuntimeCacheResponse,
	RuntimeStatusResponse,
	ServerDetail,
	ServerDetailsResp,
	// OpenAPI wrapped response types
	ServerListResp,
	ServerListResponse,
	SystemMetrics,
	SystemStatus,
	ToolDetail,
	UpdateConfigSuitRequest,
} from "./types";

// Base API URL - in a real app, this would be in an environment variable
// Using relative path so frontend and backend can work under the same domain, avoiding CORS issues
const API_BASE_URL = "";

// Helper function for making API requests
async function fetchApi<T>(
	endpoint: string,
	options?: RequestInit,
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
			let parsed: unknown;

			try {
				parsed = JSON.parse(errorText);
				console.error(`API Error (${response.status}):`, parsed);
			} catch (_e) {
				// If not JSON, use the original text
				console.error(`API Error (${response.status}):`, errorText);
			}

			const message = (() => {
				if (
					parsed &&
					typeof parsed === "object" &&
					"message" in (parsed as Record<string, unknown>) &&
					typeof (parsed as Record<string, unknown>).message === "string"
				) {
					return (parsed as Record<string, unknown>).message as string;
				}
				if (
					parsed &&
					typeof parsed === "object" &&
					"error" in (parsed as Record<string, unknown>) &&
					typeof (parsed as { error?: { message?: unknown } }).error
						?.message === "string"
				) {
					const err = parsed as { error?: { message?: unknown } };
					return (
						(err.error?.message as string) ??
						`API Error: ${response.status} ${response.statusText}`
					);
				}
				return `API Error: ${response.status} ${response.statusText}`;
			})();

			throw new Error(message);
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
			// RPC style endpoint: GET /mcp/servers/list
			const resp = await fetchApi<ServerListResp>("/api/mcp/servers/list");
			const servers = Array.isArray(resp?.data?.servers)
				? resp.data.servers
				: [];
			return { servers };
		} catch (error) {
			console.error("Failed to fetch servers:", error);
			return { servers: [] };
		}
	},

	// Get server details
	getServer: async (id: string): Promise<ServerDetail> => {
		try {
			// RPC style endpoint: GET /mcp/servers/details?id=
			const q = new URLSearchParams({ id });
			const resp = await fetchApi<ServerDetailsResp>(
				`/api/mcp/servers/details?${q.toString()}`,
			);
			const data = resp?.data;
			const instances: InstanceSummary[] = Array.isArray(data?.instances)
				? data?.instances
				: [];
			return {
				id: data?.id ?? id,
				name: data?.name ?? id,
				status: data?.status ?? "unknown",
				kind: data?.kind ?? data?.server_type ?? "unknown",
				instances,
				command: data?.command ?? undefined,
				args: data?.args ?? undefined,
				env: data?.env ?? undefined,
			};
		} catch (error) {
			console.error(`Error fetching server details for ${id}:`, error);
			return { id, name: id, status: "error", kind: "unknown", instances: [] };
		}
	},

	// Get all instances for a server
	getInstances: async (serverId: string) => {
		const q = new URLSearchParams({ id: serverId });
		const resp = await fetchApi<InstanceListResp>(
			`/api/mcp/servers/instances/list?${q.toString()}`,
		);
		return (resp?.data?.instances as InstanceSummary[]) ?? [];
	},

	// Get instance details
	getInstance: async (
		serverId: string,
		instanceId: string,
	): Promise<InstanceDetail> => {
		try {
			// RPC style: GET /mcp/servers/instances/details?server=&instance=
			const q = new URLSearchParams({ server: serverId, instance: instanceId });
			const resp = await fetchApi<InstanceDetailsResp>(
				`/api/mcp/servers/instances/details?${q.toString()}`,
			);
			const data = resp?.data;
			return {
				id: data?.id ?? instanceId,
				name: data?.name ?? instanceId,
				server_name: data?.server_name ?? serverId,
				status: data?.status ?? "unknown",
				allowed_operations: data?.allowed_operations ?? [],
				details: data?.details ?? {
					connection_attempts: 0,
					tools_count: 0,
					server_type: "unknown",
				},
			};
		} catch (error) {
			console.error(
				`Error fetching instance details for ${serverId}/${instanceId}:`,
				error,
			);
			return {
				id: instanceId,
				name: instanceId,
				server_name: serverId,
				status: "error",
				allowed_operations: [],
				details: {
					connection_attempts: 0,
					tools_count: 0,
					server_type: "unknown",
					error_message:
						error instanceof Error ? (error as Error).message : String(error),
				},
			};
		}
	},

	// Check instance health
	getInstanceHealth: async (serverId: string, instanceId: string) => {
		const q = new URLSearchParams({ server: serverId, instance: instanceId });
		const resp = await fetchApi<InstanceHealthResp>(
			`/api/mcp/servers/instances/health?${q.toString()}`,
		);
		return (
			(resp?.data as InstanceHealth) ?? {
				id: instanceId,
				name: instanceId,
				healthy: false,
				message: "No data",
				status: "unknown",
				checked_at: new Date().toISOString(),
			}
		);
	},

	// Internal helper to manage instance via RPC manage endpoint
	_manageInstance: (
		serverId: string,
		instanceId: string,
		action:
			| "Disconnect"
			| "ForceDisconnect"
			| "Reconnect"
			| "ResetReconnect"
			| "Recover"
			| "Cancel",
	) =>
		fetchApi<OperationResponseResp>(`/api/mcp/servers/instances/manage`, {
			method: "POST",
			body: JSON.stringify({ server: serverId, instance: instanceId, action }),
		}),

	// Disconnect instance
	disconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Disconnect"),

	// Force disconnect instance
	forceDisconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "ForceDisconnect"),

	// Reconnect instance
	reconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Reconnect"),

	// Reset and reconnect instance
	resetAndReconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "ResetReconnect"),

	// Cancel initializing instance
	cancelInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Cancel"),

	// The following are new server management features (mock implementation)

	// Enable server
	enableServer: async (serverId: string, sync?: boolean) => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/servers/manage", {
				method: "POST",
				body: JSON.stringify({
					id: serverId,
					action: "Enable",
					sync: sync || false
				}),
			});
		} catch (error) {
			console.warn("API not available, using mock implementation:", error);
			// Simulate successful response
			return {
				status: "success",
				message: `Server ${serverId} enabled successfully (mock)${sync ? " with sync" : ""}`,
			};
		}
	},

	// Disable server
	disableServer: async (serverId: string, sync?: boolean) => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/servers/manage", {
				method: "POST",
				body: JSON.stringify({
					id: serverId,
					action: "Disable",
					sync: sync || false
				}),
			});
		} catch (error) {
			console.warn("API not available, using mock implementation:", error);
			// Simulate successful response
			return {
				status: "success",
				message: `Server ${serverId} disabled successfully (mock)${sync ? " with sync" : ""}`,
			};
		}
	},

	// Reconnect all instances of a server
	reconnectAllInstances: async (serverId: string) => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/servers/manage", {
				method: "POST",
				body: JSON.stringify({
					id: serverId,
					action: "Reconnect"
				}),
			});
		} catch (error) {
			console.warn("API not available, using mock implementation:", error);
			// Simulate successful response
			return {
				status: "success",
				message: `All instances of server ${serverId} reconnected successfully (mock)`,
			};
		}
	},

	// Create new server (RPC: POST /mcp/servers/create)
	createServer: async (serverConfig: Partial<MCPServerConfig>) => {
		try {
			const sc = serverConfig as { url?: string; enabled?: boolean };
			const body: Record<string, unknown> = {
				name: serverConfig.name,
				kind: serverConfig.kind,
				command: serverConfig.command ?? null,
				args: serverConfig.args ?? null,
				env: serverConfig.env ?? null,
				url: sc.url ?? null,
				enabled: sc.enabled ?? null,
			};
			return await fetchApi<ServerDetailsResp>(`/api/mcp/servers/create`, {
				method: "POST",
				body: JSON.stringify(body),
			});
		} catch (error) {
			console.warn("Create server failed:", error);
			throw error;
		}
	},

	// Update server configuration (RPC: POST /mcp/servers/update)
	updateServer: async (
		serverId: string,
		serverConfig: Partial<MCPServerConfig>,
	) => {
		try {
			const sc = serverConfig as { url?: string; enabled?: boolean };
			const body: Record<string, unknown> = {
				id: serverId,
				// Note: name field is not supported in update operation
				kind: serverConfig.kind ?? null,
				command: serverConfig.command ?? null,
				args: serverConfig.args ?? null,
				env: serverConfig.env ?? null,
				url: sc.url ?? null,
				enabled: sc.enabled ?? null,
			};
			console.log("Sending update request:", body);
			const result = await fetchApi<ServerDetailsResp>(`/api/mcp/servers/update`, {
				method: "POST",
				body: JSON.stringify(body),
			});
			console.log("Update response:", result);
			return result;
		} catch (error) {
			console.warn(`Update server failed for ${serverId}:`, error);
			throw error;
		}
	},

	// Delete server (RPC: DELETE /mcp/servers/delete with JSON body)
	deleteServer: async (serverId: string) => {
		try {
			return await fetchApi<ServerDetailsResp>(`/api/mcp/servers/delete`, {
				method: "DELETE",
				body: JSON.stringify({ id: serverId }),
			});
		} catch (error) {
			console.warn(`Delete server failed for ${serverId}:`, error);
			throw error;
		}
	},
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
					const q = new URLSearchParams({ suit_id: activeSuitId });
					const suitToolsResponse = await fetchApi<{ tools: SuitTool[] }>(
						`/api/mcp/suits/tools/list?${q.toString()}`,
					);
					if (suitToolsResponse?.tools) {
						// 将后端返回的工具数组转换为前端期望的格式
						const tools = suitToolsResponse.tools.map((tool) => {
							// 确保每个工具都有唯一的 ID
							const toolId = tool.id || "";

							// 确定工具名称 - 优先使用 tool_name，然后是 name
							const toolName = tool.tool_name || tool.name || "";

							// 确定工具启用状态 - 优先使用 is_enabled，然后是 enabled
							const isEnabled =
								tool.is_enabled !== undefined
									? tool.is_enabled
									: tool.enabled !== undefined
										? tool.enabled
										: true;

							return {
								tool_name: toolName,
								server_name: tool.server_name || "",
								is_enabled: isEnabled,
								description: tool.description || "",
								tool_id: toolId,
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
			const response = await fetchApi<
				{
					name: string;
					tool_name?: string;
					description?: string;
					id?: string;
					server_name?: string;
				}[]
			>("/api/mcp/specs/tools");

			// 将后端返回的数组转换为前端期望的格式
			const tools = response.map((tool) => {
				// 确定服务器名称
				let serverName = tool.server_name;

				// 如果没有直接的 server_name，尝试从描述中提取
				if (!serverName && tool.description?.includes("server '")) {
					serverName = tool.description
						? tool.description.split("server '")[1].split("'")[0]
						: "";
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
					tool_id: toolId,
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
			return await fetchApi<{ suits: { id: string; name: string }[] }>(
				"/api/mcp/suits/list",
			);
		} catch (error) {
			console.error("Failed to fetch suits:", error);
			return { suits: [] };
		}
	},

	// Get tools in a suit
	getSuitTools: async (suitId: string) => {
		try {
			return await fetchApi<{ tools: SuitTool[] }>(
				`/api/mcp/suits/tools/list?suit_id=${suitId}`,
			);
		} catch (error) {
			console.error(`Failed to fetch tools for suit ${suitId}:`, error);
			return { tools: [] };
		}
	},

	// Get tool details
	getTool: (serverId: string, toolName: string) =>
		fetchApi<ToolDetail>(`/api/mcp/specs/tools/${serverId}/${toolName}`),

	// Update tool configuration
	updateTool: (
		serverId: string,
		toolName: string,
		config: Partial<ToolDetail>,
	) =>
		fetchApi<ApiResponse<ToolDetail>>(
			`/api/mcp/specs/tools/${serverId}/${toolName}`,
			{
				method: "POST",
				body: JSON.stringify(config),
			},
		),

	// Enable tool
	enableTool: async (suitId: string, suitToolId: string) => {
		try {
			// 使用新的 API 端点
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/tools/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						tool_id: suitToolId,
						action: "Enable"
					}),
				},
			);
		} catch (error) {
			console.warn(
				"Enable tool API not available, using mock implementation:",
				error,
			);
			// 模拟成功响应
			return {
				status: "success",
				message: `Tool ${suitToolId} enabled successfully (mock)`,
			};
		}
	},

	// Disable tool
	disableTool: async (suitId: string, suitToolId: string) => {
		try {
			// 使用新的 API 端点
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/tools/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						tool_id: suitToolId,
						action: "Disable"
					}),
				},
			);
		} catch (error) {
			console.warn(
				"Disable tool API not available, using mock implementation:",
				error,
			);
			// 模拟成功响应
			return {
				status: "success",
				message: `Tool ${suitToolId} disabled successfully (mock)`,
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

// Runtime Management API
export const runtimeApi = {
	// Get runtime status (uv/bun availability and versions)
	getStatus: () => fetchApi<RuntimeStatusResponse>("/api/runtime/status"),

	// Get runtime cache statistics
	getCache: () => fetchApi<RuntimeCacheResponse>("/api/runtime/cache"),

	// Reset runtime cache; cacheType: all | uv | bun (default all)
	resetCache: (cacheType?: "all" | "uv" | "bun") =>
		fetchApi<ClearCacheResponse>(
			cacheType
				? `/api/runtime/cache/reset?cache_type=${cacheType}`
				: "/api/runtime/cache/reset",
			{ method: "POST" },
		),

	// Install a runtime (uv or bun)
	install: (req: InstallRuntimeRequest) =>
		fetchApi<InstallResponse>("/api/runtime/install", {
			method: "POST",
			body: JSON.stringify(req),
		}),
};

// Capabilities Cache API
export const capabilitiesApi = {
	// Get capabilities cache stats view
	getStats: () =>
		fetchApi<CapabilitiesStatsResponse>(
			"/api/cache/capabilities/details?view=stats",
		),

	// Get capabilities cache keys view
	getKeys: (params?: { limit?: number; offset?: number; search?: string }) => {
		const q = new URLSearchParams();
		q.set("view", "keys");
		if (params?.limit != null) q.set("limit", String(params.limit));
		if (params?.offset != null) q.set("offset", String(params.offset));
		if (params?.search) q.set("search", params.search);
		const qs = q.toString();
		return fetchApi<CapabilitiesKeysResponse>(
			`/api/cache/capabilities/details${qs ? `?${qs}` : ""}`,
		);
	},

	// Reset capabilities cache
	reset: () =>
		fetchApi<ClearCacheResponse>("/api/cache/capabilities/reset", {
			method: "POST",
		}),
};

// 导入全局设置类型
import type { GlobalSettings } from "./types";

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
				if (Array.isArray(serversResponse?.servers)) {
					// 创建符合 MCPServerConfig 类型的服务器配置
					config.servers = serversResponse.servers.map((server) => {
						// 确保 kind 是有效的枚举值
						let serverKind: "stdio" | "sse" | "streamable_http" =
							"streamable_http";
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
				if (Array.isArray(toolsResponse?.tools)) {
					config.tools = toolsResponse.tools.map((tool) => ({
						name: tool.tool_name,
						server_name: tool.server_name ?? "",
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
			const preset = mockPresets.find((p) => p.id === id);
			if (!preset) {
				throw new Error(`Preset with ID ${id} not found`);
			}
			return preset;
		}
	},

	// Create new preset
	createPreset: async (
		preset: Omit<ConfigPreset, "id" | "created_at" | "updated_at">,
	) => {
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
			return await fetchApi<ApiResponse<ConfigPreset>>(
				`/api/config/presets/${id}`,
				{
					method: "PUT",
					body: JSON.stringify(preset),
				},
			);
		} catch (error) {
			console.warn("Config API not available, using mock data:", error);
			const index = mockPresets.findIndex((p) => p.id === id);
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
			const index = mockPresets.findIndex((p) => p.id === id);
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
			return await fetchApi<ApiResponse<null>>(
				`/api/config/presets/${id}/apply`,
				{
					method: "POST",
				},
			);
		} catch (error) {
			console.warn("Config API not available, using mock data:", error);
			const preset = mockPresets.find((p) => p.id === id);
			if (!preset) {
				throw new Error(`Preset with ID ${id} not found`);
			}

			// Mark this preset as active and others as inactive
			mockPresets.forEach((p) => {
				p.is_active = p.id === id;
			});

			return {
				status: "success",
				message: "Preset applied (mock)",
			};
		}
	},
};

// Config Suits Management API
export const configSuitsApi = {
	// Get all config suits
	getAll: async (): Promise<ConfigSuitListResponse> => {
		try {
			return await fetchApi<ConfigSuitListResponse>("/api/mcp/suits/list");
		} catch (error) {
			console.error("Failed to fetch config suits:", error);
			return { suits: [] };
		}
	},

	// Get specific config suit
	getSuit: async (id: string): Promise<ConfigSuit> => {
		try {
			const q = new URLSearchParams({ id });
			return await fetchApi<ConfigSuit>(`/api/mcp/suits/details?${q.toString()}`);
		} catch (error) {
			console.error(`Failed to fetch config suit ${id}:`, error);
			throw error;
		}
	},

	// Create new config suit
	createSuit: async (
		data: CreateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		try {
			return await fetchApi<ApiResponse<ConfigSuit>>("/api/mcp/suits/create", {
				method: "POST",
				body: JSON.stringify(data),
			});
		} catch (error) {
			console.error("Failed to create config suit:", error);
			throw error;
		}
	},

	// Update config suit
	updateSuit: async (
		id: string,
		data: UpdateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		try {
			return await fetchApi<ApiResponse<ConfigSuit>>("/api/mcp/suits/update", {
				method: "POST",
				body: JSON.stringify({ id, ...data }),
			});
		} catch (error) {
			console.error(`Failed to update config suit ${id}:`, error);
			throw error;
		}
	},

	// Delete config suit
	deleteSuit: async (id: string): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/suits/delete", {
				method: "DELETE",
				body: JSON.stringify({ id }),
			});
		} catch (error) {
			console.error(`Failed to delete config suit ${id}:`, error);
			throw error;
		}
	},

	// Activate config suit
	activateSuit: async (id: string): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/suits/manage", {
				method: "POST",
				body: JSON.stringify({ id, action: "Activate" }),
			});
		} catch (error) {
			console.error(`Failed to activate config suit ${id}:`, error);
			throw error;
		}
	},

	// Deactivate config suit
	deactivateSuit: async (id: string): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/suits/manage", {
				method: "POST",
				body: JSON.stringify({ id, action: "Deactivate" }),
			});
		} catch (error) {
			console.error(`Failed to deactivate config suit ${id}:`, error);
			throw error;
		}
	},

	// Batch activate config suits
	batchActivate: async (ids: string[]): Promise<BatchOperationResponse> => {
		try {
			// Note: This might need to be implemented as individual calls
			// since the new API uses single suit management
			const results = await Promise.allSettled(
				ids.map(id => configSuitsApi.activateSuit(id))
			);
			const successful = results.filter(r => r.status === 'fulfilled').length;
			const failed = results.filter(r => r.status === 'rejected').length;
			return {
				success_count: successful,
				successful_ids: ids.slice(0, successful),
				failed_ids: Object.fromEntries(
					ids.slice(successful).map((id, i) => [id, `Batch operation failed`])
				)
			};
		} catch (error) {
			console.error("Failed to batch activate config suits:", error);
			throw error;
		}
	},

	// Batch deactivate config suits
	batchDeactivate: async (ids: string[]): Promise<BatchOperationResponse> => {
		try {
			// Note: This might need to be implemented as individual calls
			// since the new API uses single suit management
			const results = await Promise.allSettled(
				ids.map(id => configSuitsApi.deactivateSuit(id))
			);
			const successful = results.filter(r => r.status === 'fulfilled').length;
			const failed = results.filter(r => r.status === 'rejected').length;
			return {
				success_count: successful,
				successful_ids: ids.slice(0, successful),
				failed_ids: Object.fromEntries(
					ids.slice(successful).map((id, i) => [id, `Batch operation failed`])
				)
			};
		} catch (error) {
			console.error("Failed to batch deactivate config suits:", error);
			throw error;
		}
	},

	// Get servers in config suit
	getServers: async (suitId: string): Promise<ConfigSuitServersResponse> => {
		try {
			const q = new URLSearchParams({ suit_id: suitId });
			return await fetchApi<ConfigSuitServersResponse>(
				`/api/mcp/suits/servers/list?${q.toString()}`,
			);
		} catch (error) {
			console.error(
				`Failed to fetch servers for config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Get tools in config suit
	getTools: async (suitId: string): Promise<ConfigSuitToolsResponse> => {
		try {
			const q = new URLSearchParams({ suit_id: suitId });
			return await fetchApi<ConfigSuitToolsResponse>(
				`/api/mcp/suits/tools/list?${q.toString()}`,
			);
		} catch (error) {
			console.error(`Failed to fetch tools for config suit ${suitId}:`, error);
			throw error;
		}
	},

	// Get resources in config suit
	getResources: async (
		suitId: string,
	): Promise<ConfigSuitResourcesResponse> => {
		try {
			// Note: Resources endpoint might not be available in new API
			// This might need to be removed or updated based on actual API
			return await fetchApi<ConfigSuitResourcesResponse>(
				`/api/mcp/suits/resources/list?suit_id=${suitId}`,
			);
		} catch (error) {
			console.error(
				`Failed to fetch resources for config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Get prompts in config suit
	getPrompts: async (suitId: string): Promise<ConfigSuitPromptsResponse> => {
		try {
			// Note: Prompts endpoint might not be available in new API
			// This might need to be removed or updated based on actual API
			return await fetchApi<ConfigSuitPromptsResponse>(
				`/api/mcp/suits/prompts/list?suit_id=${suitId}`,
			);
		} catch (error) {
			console.error(
				`Failed to fetch prompts for config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Enable server in config suit
	enableServer: async (
		suitId: string,
		serverId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/servers/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						server_id: serverId,
						action: "Enable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to enable server ${serverId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Disable server in config suit
	disableServer: async (
		suitId: string,
		serverId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/servers/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						server_id: serverId,
						action: "Disable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to disable server ${serverId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Enable tool in config suit
	enableTool: async (
		suitId: string,
		toolId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/tools/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						tool_id: toolId,
						action: "Enable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to enable tool ${toolId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Disable tool in config suit
	disableTool: async (
		suitId: string,
		toolId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/tools/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						tool_id: toolId,
						action: "Disable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to disable tool ${toolId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Enable resource in config suit
	// Note: Resource management might not be available in new API
	enableResource: async (
		suitId: string,
		resourceId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/resources/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						resource_id: resourceId,
						action: "Enable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to enable resource ${resourceId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Disable resource in config suit
	// Note: Resource management might not be available in new API
	disableResource: async (
		suitId: string,
		resourceId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/resources/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						resource_id: resourceId,
						action: "Disable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to disable resource ${resourceId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Enable prompt in config suit
	// Note: Prompt management might not be available in new API
	enablePrompt: async (
		suitId: string,
		promptId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/prompts/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						prompt_id: promptId,
						action: "Enable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to enable prompt ${promptId} in config suit ${suitId}:`,
				error,
			);
			throw error;
		}
	},

	// Disable prompt in config suit
	// Note: Prompt management might not be available in new API
	disablePrompt: async (
		suitId: string,
		promptId: string,
	): Promise<ApiResponse<null>> => {
		try {
			return await fetchApi<ApiResponse<null>>(
				"/api/mcp/suits/prompts/manage",
				{
					method: "POST",
					body: JSON.stringify({
						suit_id: suitId,
						prompt_id: promptId,
						action: "Disable"
					}),
				},
			);
		} catch (error) {
			console.error(
				`Failed to disable prompt ${promptId} in config suit ${suitId}:`,
				error,
			);
			throw error;
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
	private listeners: Map<string, ((data: NotificationData) => void)[]> =
		new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 5000; // 5 seconds

	connect() {
		if (this.ws) return;

		// 使用相对路径，避免CORS问题
		const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
		console.log(`Connecting to WebSocket at ${wsUrl}`);

		try {
			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				console.log("WebSocket connection established");
				this.reconnectAttempts = 0; // 重置重连计数
			};

			this.ws.onmessage = (event) => {
				try {
					console.log("WebSocket message received:", event.data);
					const data = JSON.parse(event.data) as NotificationData;
					if (data.event) {
						const eventListeners = this.listeners.get(data.event) || [];
						console.log(
							`Dispatching ${data.event} event to ${eventListeners.length} listeners`,
						);
						eventListeners.forEach((listener) => {
							listener(data);
						});
					}
				} catch (error) {
					console.error("Error parsing WebSocket message:", error);
				}
			};

			this.ws.onerror = (error) => {
				console.error("WebSocket error:", error);
			};

			this.ws.onclose = (event) => {
				console.log(
					`WebSocket connection closed: ${event.code} ${event.reason}`,
				);
				this.ws = null;

				// 实现指数退避重连策略
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					const delay = this.reconnectDelay * 1.5 ** this.reconnectAttempts;
					this.reconnectAttempts++;
					console.log(
						`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
					);
					setTimeout(() => this.connect(), delay);
				} else {
					console.error(
						`Failed to reconnect after ${this.maxReconnectAttempts} attempts`,
					);
				}
			};
		} catch (error) {
			console.error("Error creating WebSocket connection:", error);
		}
	}

	subscribe(event: string, callback: (data: NotificationData) => void) {
		let list = this.listeners.get(event);
		if (!list) {
			list = [];
			this.listeners.set(event, list);
		}
		list.push(callback);

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
