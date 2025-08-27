import type {
	ApiResponse,
	BatchOperationResponse,
	CapabilitiesKeysResponse,
	CapabilitiesMetricsStats,
	CapabilitiesStatsResponse,
	CapabilitiesStorageStats,
	ClearCacheResponse,
	ConfigPreset,
	ConfigSuit,
	ConfigSuitListResponse,
	ConfigSuitPromptsResponse,
	ConfigSuitResourcesResponse,
	ConfigSuitServer,
	ConfigSuitServersResponse,
	ConfigSuitTool,
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
	ServerListResp,
	ServerListResponse,
	SystemMetrics,
	SystemStatus,
	ToolDetail,
	UpdateConfigSuitRequest,
} from "./types";

// Base API configuration
const API_BASE_URL = "";

// Utility types
interface ApiWrapper<T> {
	success: boolean;
	data?: T;
	error?: unknown;
}

interface SuitTool {
	id: string;
	name?: string;
	tool_name?: string;
	server_name: string;
	description?: string;
	enabled?: boolean;
	is_enabled?: boolean;
}

interface NotificationData {
	[key: string]: unknown;
	event?: string;
}

// Enhanced error handling utility
function createApiError(response: Response, parsed?: unknown): Error {
	if (parsed && typeof parsed === "object") {
		const obj = parsed as Record<string, unknown>;
		if (typeof obj.message === "string") {
			return new Error(obj.message);
		}
		if (obj.error && typeof obj.error === "object") {
			const errorObj = obj.error as { message?: unknown };
			if (typeof errorObj.message === "string") {
				return new Error(errorObj.message);
			}
		}
	}
	return new Error(`API Error: ${response.status} ${response.statusText}`);
}

// Core API request function
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
			const errorText = await response.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(errorText);
				console.error(`API Error (${response.status}):`, parsed);
			} catch {
				console.error(`API Error (${response.status}):`, errorText);
			}
			throw createApiError(response, parsed);
		}

		const data = await response.json();
		console.log(`API Response from ${endpoint}:`, data);
		return data as T;
	} catch (error) {
		console.error(`API Request Failed for ${endpoint}:`, error);
		throw error;
	}
}

// Utility function to extract data from wrapped API responses
function extractApiData<T>(response: ApiWrapper<T>): T {
	if (response.success && response.data) {
		return response.data;
	}
	throw new Error(
		response.error ? String(response.error) : "API request failed",
	);
}

// Utility function for batch operations
async function executeBatchOperation(
	ids: string[],
	operation: (id: string) => Promise<unknown>,
): Promise<BatchOperationResponse> {
	const results = await Promise.allSettled(ids.map(operation));
	const successful = results.filter((r) => r.status === "fulfilled").length;
	const failed = results.length - successful;

	return {
		success_count: successful,
		successful_ids: ids.slice(0, successful),
		failed_ids: Object.fromEntries(
			ids.slice(successful).map((id) => [id, "Batch operation failed"]),
		),
	};
}

// Server Management API
export const serversApi = {
	getAll: async (): Promise<ServerListResponse> => {
		try {
			const resp = await fetchApi<ServerListResp>("/api/mcp/servers/list");
			return {
				servers: Array.isArray(resp?.data?.servers) ? resp.data.servers : [],
			};
		} catch (error) {
			console.error("Failed to fetch servers:", error);
			return { servers: [] };
		}
	},

	getServer: async (id: string): Promise<ServerDetail> => {
		try {
			const q = new URLSearchParams({ id });
			const resp = await fetchApi<ServerDetailsResp>(
				`/api/mcp/servers/details?${q}`,
			);
			const data = resp?.data;
			return {
				id: data?.id ?? id,
				name: data?.name ?? id,
				status: data?.status ?? "unknown",
				kind: data?.kind ?? data?.server_type ?? "unknown",
				instances: Array.isArray(data?.instances) ? data.instances : [],
				command: data?.command,
				args: data?.args,
				env: data?.env,
			};
		} catch (error) {
			console.error(`Error fetching server details for ${id}:`, error);
			return { id, name: id, status: "error", kind: "unknown", instances: [] };
		}
	},

	getInstances: async (serverId: string) => {
		const q = new URLSearchParams({ id: serverId });
		const resp = await fetchApi<InstanceListResp>(
			`/api/mcp/servers/instances/list?${q}`,
		);
		return (resp?.data?.instances as InstanceSummary[]) ?? [];
	},

	getInstance: async (
		serverId: string,
		instanceId: string,
	): Promise<InstanceDetail> => {
		try {
			const q = new URLSearchParams({ server: serverId, instance: instanceId });
			const resp = await fetchApi<InstanceDetailsResp>(
				`/api/mcp/servers/instances/details?${q}`,
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
					error_message: error instanceof Error ? error.message : String(error),
				},
			};
		}
	},

	getInstanceHealth: async (serverId: string, instanceId: string) => {
		const q = new URLSearchParams({ server: serverId, instance: instanceId });
		const resp = await fetchApi<InstanceHealthResp>(
			`/api/mcp/servers/instances/health?${q}`,
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

	// Instance management operations
	_manageInstance: (serverId: string, instanceId: string, action: string) =>
		fetchApi<OperationResponseResp>("/api/mcp/servers/instances/manage", {
			method: "POST",
			body: JSON.stringify({ server: serverId, instance: instanceId, action }),
		}),

	disconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Disconnect"),

	forceDisconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "ForceDisconnect"),

	reconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Reconnect"),

	resetAndReconnectInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "ResetReconnect"),

	cancelInstance: (serverId: string, instanceId: string) =>
		serversApi._manageInstance(serverId, instanceId, "Cancel"),

	// Server management operations
	_manageServer: async (serverId: string, action: string, sync = false) => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/servers/manage", {
				method: "POST",
				body: JSON.stringify({ id: serverId, action, sync }),
			});
		} catch (error) {
			console.warn("API not available, using mock implementation:", error);
			return {
				status: "success",
				message: `Server ${serverId} ${action.toLowerCase()}d successfully (mock)${sync ? " with sync" : ""}`,
			};
		}
	},

	enableServer: (serverId: string, sync?: boolean) =>
		serversApi._manageServer(serverId, "Enable", sync),

	disableServer: (serverId: string, sync?: boolean) =>
		serversApi._manageServer(serverId, "Disable", sync),

	reconnectAllInstances: (serverId: string) =>
		serversApi._manageServer(serverId, "Reconnect"),

	// Server start/stop operations (mapped to enable/disable)
	startServer: (serverId: string, sync?: boolean) =>
		serversApi._manageServer(serverId, "Enable", sync),

	stopServer: (serverId: string, sync?: boolean) =>
		serversApi._manageServer(serverId, "Disable", sync),

	// CRUD operations
	createServer: async (serverConfig: Partial<MCPServerConfig>) => {
		const sc = serverConfig as { url?: string; enabled?: boolean };
		const body = {
			name: serverConfig.name,
			kind: serverConfig.kind,
			command: serverConfig.command ?? null,
			args: serverConfig.args ?? null,
			env: serverConfig.env ?? null,
			url: sc.url ?? null,
			enabled: sc.enabled ?? null,
		};
		return fetchApi<ServerDetailsResp>("/api/mcp/servers/create", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	updateServer: async (
		serverId: string,
		serverConfig: Partial<MCPServerConfig>,
	) => {
		const sc = serverConfig as { url?: string; enabled?: boolean };
		const body = {
			id: serverId,
			kind: serverConfig.kind ?? null,
			command: serverConfig.command ?? null,
			args: serverConfig.args ?? null,
			env: serverConfig.env ?? null,
			url: sc.url ?? null,
			enabled: sc.enabled ?? null,
		};
		return fetchApi<ServerDetailsResp>("/api/mcp/servers/update", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},

	deleteServer: (serverId: string) =>
		fetchApi<ServerDetailsResp>("/api/mcp/servers/delete", {
			method: "DELETE",
			body: JSON.stringify({ id: serverId }),
		}),
};

// Tools Management API
export const toolsApi = {
	getAll: async () => {
		try {
			// Try to get tools from config suits first
			const suitsResponse = await toolsApi.getSuits();
			if (suitsResponse?.suits?.length > 0) {
				const activeSuitId = suitsResponse.suits[0].id;
				try {
					const q = new URLSearchParams({ suit_id: activeSuitId });
					const suitToolsResponse = await fetchApi<{ tools: SuitTool[] }>(
						`/api/mcp/suits/tools/list?${q}`,
					);
					if (suitToolsResponse?.tools) {
						const tools = suitToolsResponse.tools.map((tool) => ({
							tool_name: tool.tool_name || tool.name || "",
							server_name: tool.server_name || "",
							is_enabled: tool.is_enabled ?? tool.enabled ?? true,
							description: tool.description || "",
							tool_id: tool.id || "",
						}));
						return { tools };
					}
				} catch (suitToolsError) {
					console.error("Failed to fetch suit tools:", suitToolsError);
				}
			}

			// Fallback to specs endpoint
			const response = await fetchApi<
				Array<{
					name: string;
					tool_name?: string;
					description?: string;
					id?: string;
					server_name?: string;
				}>
			>("/api/mcp/specs/tools");

			const tools = response.map((tool) => {
				let serverName = tool.server_name;
				if (!serverName && tool.description?.includes("server '")) {
					serverName = tool.description.split("server '")[1].split("'")[0];
				}
				const toolName = tool.tool_name || tool.name || "";
				const toolId = tool.id || `${serverName}_${toolName}`;

				return {
					tool_name: toolName,
					server_name: serverName || "",
					is_enabled: true,
					description: tool.description || "",
					tool_id: toolId,
				};
			});

			return { tools };
		} catch (error) {
			console.error("Failed to fetch tools:", error);
			return { tools: [] };
		}
	},

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

	getTool: (serverId: string, toolName: string) =>
		fetchApi<ToolDetail>(`/api/mcp/specs/tools/${serverId}/${toolName}`),

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

	// Tool management operations
	_manageTool: async (suitId: string, suitToolId: string, action: string) => {
		try {
			return await fetchApi<ApiResponse<null>>("/api/mcp/suits/tools/manage", {
				method: "POST",
				body: JSON.stringify({ suit_id: suitId, tool_id: suitToolId, action }),
			});
		} catch (error) {
			console.warn(
				`${action} tool API not available, using mock implementation:`,
				error,
			);
			return {
				status: "success",
				message: `Tool ${suitToolId} ${action.toLowerCase()}d successfully (mock)`,
			};
		}
	},

	enableTool: (suitId: string, suitToolId: string) =>
		toolsApi._manageTool(suitId, suitToolId, "Enable"),

	disableTool: (suitId: string, suitToolId: string) =>
		toolsApi._manageTool(suitId, suitToolId, "Disable"),
};

// System Management API
export const systemApi = {
	getStatus: () => fetchApi<SystemStatus>("/api/system/status"),
	getMetrics: () => fetchApi<SystemMetrics>("/api/system/metrics"),
};

// Runtime Management API
export const runtimeApi = {
	getStatus: async (): Promise<RuntimeStatusResponse> => {
		const response = await fetchApi<ApiWrapper<RuntimeStatusResponse>>(
			"/api/runtime/status",
		);
		return extractApiData(response);
	},

	getCache: async (): Promise<RuntimeCacheResponse> => {
		const response =
			await fetchApi<ApiWrapper<RuntimeCacheResponse>>("/api/runtime/cache");
		return extractApiData(response);
	},

	resetCache: (cacheType?: "all" | "uv" | "bun") =>
		fetchApi<ClearCacheResponse>("/api/runtime/cache/reset", {
			method: "POST",
			body: JSON.stringify({ cache_type: cacheType || "all" }),
		}),

	install: (req: InstallRuntimeRequest) =>
		fetchApi<InstallResponse>("/api/runtime/install", {
			method: "POST",
			body: JSON.stringify(req),
		}),
};

// Capabilities Cache API
export const capabilitiesApi = {
	getStats: async (): Promise<CapabilitiesStatsResponse> => {
		const response = await fetchApi<
			ApiWrapper<{
				storage: CapabilitiesStorageStats;
				metrics: CapabilitiesMetricsStats;
				generated_at: string;
			}>
		>("/api/cache/capabilities/details?view=stats");

		const data = extractApiData(response);
		return {
			storage: data.storage,
			metrics: data.metrics,
			generatedAt: data.generated_at,
		};
	},

	getKeys: (params?: { limit?: number; offset?: number; search?: string }) => {
		const q = new URLSearchParams({ view: "keys" });
		if (params?.limit != null) q.set("limit", String(params.limit));
		if (params?.offset != null) q.set("offset", String(params.offset));
		if (params?.search) q.set("search", params.search);
		return fetchApi<CapabilitiesKeysResponse>(
			`/api/cache/capabilities/details?${q}`,
		);
	},

	reset: () =>
		fetchApi<ClearCacheResponse>("/api/cache/capabilities/reset", {
			method: "POST",
		}),
};

// Configuration Management API
export const configApi = {
	getCurrentConfig: async (): Promise<MCPConfig> => {
		try {
			return await fetchApi<MCPConfig>("/api/config/current");
		} catch (error) {
			console.warn(
				"Config API not available, building from available data:",
				error,
			);

			// Build config from available APIs
			const config: MCPConfig = {
				servers: [],
				tools: [],
				global_settings: {
					max_concurrent_connections: 10,
					request_timeout_ms: 30000,
					enable_metrics: true,
					log_level: "info",
				},
			};

			// Try to populate with real data
			try {
				const serversResponse = await serversApi.getAll();
				if (Array.isArray(serversResponse?.servers)) {
					config.servers = serversResponse.servers.map((server) => ({
						name: server.name,
						kind:
							server.kind === "stdio" || server.kind === "sse"
								? server.kind
								: "streamable_http",
						command: "",
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
					}));
				}
			} catch (e) {
				console.error("Failed to fetch servers for config:", e);
			}

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
				console.error("Failed to fetch tools for config:", e);
			}

			return config;
		}
	},

	updateConfig: async (config: MCPConfig) => {
		try {
			return await fetchApi<ApiResponse<MCPConfig>>("/api/config", {
				method: "POST",
				body: JSON.stringify(config),
			});
		} catch (error) {
			console.warn("Config API not available, using mock response:", error);
			return {
				status: "success",
				message: "Configuration updated (mock)",
				data: config,
			};
		}
	},

	// Preset management with simplified mock fallback
	getPresets: async () => {
		try {
			return await fetchApi<ConfigPreset[]>("/api/config/presets");
		} catch (error) {
			console.warn("Config API not available, using mock data:", error);
			return [
				{
					id: "default",
					name: "Default Configuration",
					description: "Default system configuration",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					is_active: true,
					config: await configApi.getCurrentConfig(),
				},
			];
		}
	},

	getPreset: async (id: string) => {
		try {
			return await fetchApi<ConfigPreset>(`/api/config/presets/${id}`);
		} catch (error) {
			console.warn("Config API not available, using mock data:", error);
			const presets = await configApi.getPresets();
			const preset = presets.find((p) => p.id === id);
			if (!preset) throw new Error(`Preset with ID ${id} not found`);
			return preset;
		}
	},

	createPreset: (
		preset: Omit<ConfigPreset, "id" | "created_at" | "updated_at">,
	) =>
		fetchApi<ApiResponse<ConfigPreset>>("/api/config/presets", {
			method: "POST",
			body: JSON.stringify(preset),
		}),

	updatePreset: (id: string, preset: Partial<ConfigPreset>) =>
		fetchApi<ApiResponse<ConfigPreset>>(`/api/config/presets/${id}`, {
			method: "PUT",
			body: JSON.stringify(preset),
		}),

	deletePreset: (id: string) =>
		fetchApi<ApiResponse<null>>(`/api/config/presets/${id}`, {
			method: "DELETE",
		}),

	applyPreset: (id: string) =>
		fetchApi<ApiResponse<null>>(`/api/config/presets/${id}/apply`, {
			method: "POST",
		}),
};

// Config Suits Management API
export const configSuitsApi = {
	getAll: async (): Promise<ConfigSuitListResponse> => {
		try {
			const response = await fetchApi<
				ApiWrapper<{ suits: ConfigSuit[]; total: number; timestamp: string }>
			>("/api/mcp/suits/list");
			const data = extractApiData(response);
			return { suits: data.suits };
		} catch (error) {
			console.error("Failed to fetch config suits:", error);
			return { suits: [] };
		}
	},

	getSuit: async (id: string): Promise<ConfigSuit> => {
		const q = new URLSearchParams({ id });
		const response = await fetchApi<ApiWrapper<{ suit: ConfigSuit }>>(
			`/api/mcp/suits/details?${q}`,
		);
		const data = extractApiData(response);
		return data.suit;
	},

	createSuit: async (
		data: CreateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		const response = await fetchApi<ApiWrapper<ConfigSuit>>(
			"/api/mcp/suits/create",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
		const result = extractApiData(response);
		return {
			status: "success",
			message: "Config suit created successfully",
			data: result,
		};
	},

	updateSuit: async (
		id: string,
		data: UpdateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		const response = await fetchApi<ApiWrapper<ConfigSuit>>(
			`/api/mcp/suits/update`,
			{
				method: "PUT",
				body: JSON.stringify({ id, ...data }),
			},
		);
		const result = extractApiData(response);
		return {
			status: "success",
			message: "Config suit updated successfully",
			data: result,
		};
	},

	deleteSuit: async (id: string): Promise<ApiResponse<void>> => {
		const response = await fetchApi<ApiWrapper<void>>(`/api/mcp/suits/delete`, {
			method: "DELETE",
			body: JSON.stringify({ id }),
		});
		extractApiData(response);
		return {
			status: "success",
			message: "Config suit deleted successfully",
		};
	},

	// Suit management operations
	_manageSuit: async (id: string, action: string) => {
		const response = await fetchApi<ApiWrapper<unknown>>(
			"/api/mcp/suits/manage",
			{
				method: "POST",
				body: JSON.stringify({ ids: [id], action }),
			},
		);
		extractApiData(response);
		return {
			status: "success",
			message: `Config suit ${action}d successfully`,
			data: null,
		};
	},

	activateSuit: (id: string) => configSuitsApi._manageSuit(id, "activate"),
	deactivateSuit: (id: string) => configSuitsApi._manageSuit(id, "deactivate"),

	// Batch operations
	batchActivate: (ids: string[]) =>
		executeBatchOperation(ids, configSuitsApi.activateSuit),
	batchDeactivate: (ids: string[]) =>
		executeBatchOperation(ids, configSuitsApi.deactivateSuit),

	// Suit content management
	getServers: async (suitId: string): Promise<ConfigSuitServersResponse> => {
		const q = new URLSearchParams({ suit_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				suit_id: string;
				suit_name: string;
				servers: ConfigSuitServer[];
			}>
		>(`/api/mcp/suits/servers/list?${q}`);
		return extractApiData(response);
	},

	getTools: async (suitId: string): Promise<ConfigSuitToolsResponse> => {
		const q = new URLSearchParams({ suit_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				suit_id: string;
				suit_name: string;
				tools: ConfigSuitTool[];
			}>
		>(`/api/mcp/suits/tools/list?${q}`);
		return extractApiData(response);
	},

	getResources: async (
		suitId: string,
	): Promise<ConfigSuitResourcesResponse> => {
		try {
			return await fetchApi<ConfigSuitResourcesResponse>(
				`/api/mcp/suits/resources/list?suit_id=${suitId}`,
			);
		} catch (error) {
			console.warn(
				`Resources endpoint not implemented yet for config suit ${suitId}:`,
				error,
			);
			return { suit_id: suitId, suit_name: "Unknown", resources: [] };
		}
	},

	getPrompts: async (suitId: string): Promise<ConfigSuitPromptsResponse> => {
		try {
			return await fetchApi<ConfigSuitPromptsResponse>(
				`/api/mcp/suits/prompts/list?suit_id=${suitId}`,
			);
		} catch (error) {
			console.warn(
				`Prompts endpoint not implemented yet for config suit ${suitId}:`,
				error,
			);
			return { suit_id: suitId, suit_name: "Unknown", prompts: [] };
		}
	},

	// Component management operations
	_manageComponent: (
		endpoint: string,
		suitId: string,
		componentId: string,
		action: string,
	) =>
		fetchApi<ApiResponse<null>>(`/api/mcp/suits/${endpoint}/manage`, {
			method: "POST",
			body: JSON.stringify({
				suit_id: suitId,
				[`${endpoint.slice(0, -1)}_id`]: componentId,
				action,
			}),
		}),

	enableServer: (suitId: string, serverId: string) =>
		configSuitsApi._manageComponent("servers", suitId, serverId, "Enable"),
	disableServer: (suitId: string, serverId: string) =>
		configSuitsApi._manageComponent("servers", suitId, serverId, "Disable"),
	enableTool: (suitId: string, toolId: string) =>
		configSuitsApi._manageComponent("tools", suitId, toolId, "Enable"),
	disableTool: (suitId: string, toolId: string) =>
		configSuitsApi._manageComponent("tools", suitId, toolId, "Disable"),
	enableResource: (suitId: string, resourceId: string) =>
		configSuitsApi._manageComponent("resources", suitId, resourceId, "Enable"),
	disableResource: (suitId: string, resourceId: string) =>
		configSuitsApi._manageComponent("resources", suitId, resourceId, "Disable"),
	enablePrompt: (suitId: string, promptId: string) =>
		configSuitsApi._manageComponent("prompts", suitId, promptId, "Enable"),
	disablePrompt: (suitId: string, promptId: string) =>
		configSuitsApi._manageComponent("prompts", suitId, promptId, "Disable"),
};

// WebSocket Notifications Service
export class NotificationsService {
	private ws: WebSocket | null = null;
	private listeners: Map<string, ((data: NotificationData) => void)[]> =
		new Map();
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private readonly reconnectDelay = 5000;

	connect() {
		if (this.ws) return;

		const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
		console.log(`Connecting to WebSocket at ${wsUrl}`);

		try {
			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				console.log("WebSocket connection established");
				this.reconnectAttempts = 0;
			};

			this.ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as NotificationData;
					if (data.event) {
						const eventListeners = this.listeners.get(data.event) || [];
						eventListeners.forEach((listener) => listener(data));
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
