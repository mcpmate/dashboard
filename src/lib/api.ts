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
	ServerCapabilityResp,
	SystemMetrics,
	SystemStatus,
	ToolDetail,
	UpdateConfigSuitRequest,
	ClientCheckResp,
	ClientManageResp,
	ClientManageAction,
	ClientConfigResp,
	ClientConfigUpdateReq,
	ClientConfigUpdateResp,
	ClientConfigRestoreReq,
	ClientBackupListResp,
	ClientBackupActionResp,
	ClientBackupPolicyResp,
	ClientBackupPolicySetReq,
} from "./types";

// Base API configuration
// Prefer VITE_API_BASE_URL; otherwise infer from runtime context with sane fallbacks
const resolveApiBaseUrl = (): string => {
	const envBase =
		typeof import.meta !== "undefined" &&
		(import.meta as any)?.env?.VITE_API_BASE_URL;

	if (typeof envBase === "string" && envBase.trim().length > 0) {
		return envBase.trim();
	}

	if (typeof window !== "undefined" && typeof window.location !== "undefined") {
		const protocol = window.location.protocol;
		const normalizedProtocol = protocol ? protocol.toLowerCase() : "";

		// Tauri / desktop shells use a custom protocol (e.g. tauri://localhost)
		if (normalizedProtocol === "tauri:" || normalizedProtocol === "app:" || normalizedProtocol === "file:") {
			return "http://127.0.0.1:8080";
		}

		if (window.location.origin) {
			return window.location.origin;
		}
	}

	// Final safety net so API calls never end up on the custom protocol origin
	return "http://127.0.0.1:8080";
};

const API_BASE_URL = resolveApiBaseUrl();

const resolveWebSocketUrl = (): string => {
	if (typeof window === "undefined") {
		return "";
	}

	const baseCandidate = API_BASE_URL || window.location.origin;

	try {
		const parsed = new URL(baseCandidate);
		const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
		const host = parsed.host || parsed.hostname;
		return `${protocol}//${host}/ws`;
	} catch (error) {
		console.warn(
			"Failed to derive WebSocket URL from API base, falling back to window location",
			error,
		);
		const fallbackProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		return `${fallbackProtocol}//${window.location.host}/ws`;
	}
};

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
			const enabledValue =
				typeof data?.enabled === "boolean"
					? data.enabled
					: typeof data?.globally_enabled === "boolean"
					? data.globally_enabled
					: undefined;

			const instances = Array.isArray(data?.instances) ? data.instances : [];

			const rawStatus = (data?.status ?? data?.state ?? data?.runtime_status ?? data?.meta?.state ?? "")
				.toString()
				.toLowerCase();

			const statusMap: Record<string, string> = {
				ready: "ready",
				running: "ready",
				connected: "ready",
				busy: "busy",
				active: "ready",
				healthy: "ready",
				idle: "idle",
				unload: enabledValue ? "idle" : "disabled",
				unloaded: enabledValue ? "idle" : "disabled",
				disabled: "disabled",
				offline: "shutdown",
				stopped: "stopped",
				stopping: "stopped",
				error: "error",
				failed: "error",
				unknown: "unknown",
			};

			const hasActiveInstance = instances.some((instance) =>
				[
					"ready",
					"running",
					"connected",
					"busy",
					"active",
					"healthy",
					"thinking",
					"fetch",
				].includes((instance.status || "").toLowerCase()),
			);
			const hasInitializingInstance = instances.some((instance) =>
				["initializing", "starting", "connecting"].includes(
					(instance.status || "").toLowerCase(),
				),
			);
			const hasErrorInstance = instances.some((instance) =>
				["error", "unhealthy", "stopped", "failed"].includes(
					(instance.status || "").toLowerCase(),
				),
			);

			let normalizedStatus = statusMap[rawStatus] ?? rawStatus;
			if (!normalizedStatus) {
				if (hasActiveInstance) normalizedStatus = "ready";
				else if (hasInitializingInstance) normalizedStatus = "initializing";
				else if (hasErrorInstance) normalizedStatus = "error";
				else normalizedStatus = enabledValue ? "idle" : "disabled";
			}

			return {
				id: data?.id ?? id,
				name: data?.name ?? id,
				status: normalizedStatus,
				kind: data?.kind ?? data?.server_type ?? "unknown",
				server_type: data?.server_type,
				enabled: enabledValue,
				globally_enabled: typeof data?.globally_enabled === "boolean" ? data.globally_enabled : undefined,
				enabled_in_suits: typeof data?.enabled_in_suits === "boolean" ? data.enabled_in_suits : undefined,
				enabled_in_profile: typeof data?.enabled_in_profile === "boolean" ? data.enabled_in_profile : undefined,
				instances,
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
		const serverType = (serverConfig.kind || "stdio") as string;
		const base: Record<string, unknown> = {
			name: serverConfig.name,
			server_type: serverType,
			enabled: sc.enabled ?? undefined,
		};
		if (serverType === "stdio") {
			base.command = serverConfig.command ?? undefined;
			if (Array.isArray(serverConfig.args)) base.args = serverConfig.args;
			if (serverConfig.env && typeof serverConfig.env === "object")
				base.env = serverConfig.env as Record<string, string>;
		} else {
			base.url = sc.url ?? serverConfig.command ?? undefined;
		}
		try {
			return await fetchApi<ServerDetailsResp>("/api/mcp/servers/create", {
				method: "POST",
				body: JSON.stringify(base),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// Fallback to import when the create endpoint rejects (schema/DB constraints)
			if (
				/Check constraint violation|Unprocessable Entity|Invalid server type|missing field `server_type`/i.test(
					msg,
				)
			) {
				const name = String(serverConfig.name || "").trim();
				const importBody: any = { mcpServers: {} as Record<string, any> };
				const cfg: any = { type: serverType };
				if (serverType === "stdio") {
					if (serverConfig.command) cfg.command = serverConfig.command;
					if (Array.isArray(serverConfig.args)) cfg.args = serverConfig.args;
					if (serverConfig.env) cfg.env = serverConfig.env;
				} else {
					if (sc.url) cfg.url = sc.url;
					else if (serverConfig.command) cfg.url = serverConfig.command;
				}
				importBody.mcpServers[name] = cfg;
				await fetchApi<ServersImportResp>("/api/mcp/servers/import", {
					method: "POST",
					body: JSON.stringify(importBody),
				});
				// Return a minimal compatible response; list refetch will normalize
				return {
					success: true,
					data: {
						id: name,
						name,
						status: "unknown",
						kind: serverType as any,
						instances: [],
						command: serverConfig.command,
						args: serverConfig.args,
						env: serverConfig.env as any,
					},
					error: null,
				} as unknown as ServerDetailsResp;
			}
			throw e;
		}
	},

	updateServer: async (
		serverId: string,
		serverConfig: Partial<MCPServerConfig>,
	) => {
		const sc = serverConfig as { url?: string; enabled?: boolean };
		const serverType = serverConfig.kind as string | undefined;
		const body: Record<string, unknown> = {
			id: serverId,
			kind: serverConfig.kind ?? undefined,
			args: serverConfig.args ?? undefined,
			env: serverConfig.env ?? undefined,
			enabled: sc.enabled ?? undefined,
		};
		if (serverType === "stdio" || !serverType) {
			body.command = serverConfig.command ?? undefined;
			body.url = sc.url ?? undefined;
		} else {
			body.url = sc.url ?? serverConfig.command ?? undefined;
			body.command = undefined;
		}
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

	// Server capabilities listing
	listTools: async (
		serverId: string,
		refresh: "auto" | "force" | "cache" = "auto",
	): Promise<{ items: any[]; meta?: any; state?: string }> => {
		const q = new URLSearchParams({ id: serverId, refresh });
		const resp = await fetchApi<{
			success: boolean;
			data?: { items: any[]; meta?: any; state?: string } | null;
			error?: unknown | null;
		}>(`/api/mcp/servers/tools?${q}`);
		return (resp?.data as any) || { items: [] };
	},
	listResources: async (
		serverId: string,
		refresh: "auto" | "force" | "cache" = "auto",
	): Promise<{ items: any[]; meta?: any; state?: string }> => {
		const q = new URLSearchParams({ id: serverId, refresh });
		const resp = await fetchApi<{
			success: boolean;
			data?: { items: any[]; meta?: any; state?: string } | null;
			error?: unknown | null;
		}>(`/api/mcp/servers/resources?${q}`);
		return (resp?.data as any) || { items: [] };
	},
	listPrompts: async (
		serverId: string,
		refresh: "auto" | "force" | "cache" = "auto",
	): Promise<{ items: any[]; meta?: any; state?: string }> => {
		const q = new URLSearchParams({ id: serverId, refresh });
		const resp = await fetchApi<{
			success: boolean;
			data?: { items: any[]; meta?: any; state?: string } | null;
			error?: unknown | null;
		}>(`/api/mcp/servers/prompts?${q}`);
		return (resp?.data as any) || { items: [] };
	},
	listResourceTemplates: async (
		serverId: string,
		refresh: "auto" | "force" | "cache" = "auto",
	): Promise<{ items: any[]; meta?: any; state?: string }> => {
		const q = new URLSearchParams({ id: serverId, refresh });
		const resp = await fetchApi<{
			success: boolean;
			data?: { items: any[]; meta?: any; state?: string } | null;
			error?: unknown | null;
		}>(`/api/mcp/servers/resources/templates?${q}`);
		return (resp?.data as any) || { items: [] };
	},

	// Import servers from JSON-like configuration object
	importServers: async (payload: {
		mcpServers: Record<string, any>;
	}): Promise<{
		success: boolean;
		data?: any;
		error?: unknown | null;
	}> => {
		return await fetchApi(`/api/mcp/servers/import`, {
			method: "POST",
			body: JSON.stringify(payload),
		});
	},

	// Preview capabilities for proposed server configs without importing
	previewServers: async (payload: {
		include_details?: boolean | null;
		timeout_ms?: number | null;
		servers: Array<{
			name: string;
			kind: string;
			command?: string | null;
			args?: string[] | null;
			env?: Record<string, string> | null;
			url?: string | null;
		}>;
	}): Promise<{
		success: boolean;
		data?: { items: any[] } | null;
		error?: unknown | null;
	}> => {
		return await fetchApi(`/api/mcp/servers/preview`, {
			method: "POST",
			body: JSON.stringify(payload),
		});
	},
};

// Inspector API
export const inspectorApi = {
  toolsList: (q: { server_id?: string; server_name?: string; mode?: "proxy"|"native"; refresh?: boolean }) => {
    const qs = new URLSearchParams();
    if (q.server_id) qs.set("server_id", q.server_id);
    if (q.server_name) qs.set("server_name", q.server_name);
    if (q.mode) qs.set("mode", q.mode);
    if (q.refresh != null) qs.set("refresh", String(q.refresh));
    return fetchApi(`/api/mcp/inspector/tool/list?${qs}`);
  },
  toolCall: (req: { tool: string; server_id?: string; server_name?: string; arguments?: Record<string, any>; mode?: "proxy"|"native"; timeout_ms?: number }) =>
    fetchApi(`/api/mcp/inspector/tool/call`, { method: "POST", body: JSON.stringify(req) }),
  toolCallStream: (q: { server_id?: string; server_name?: string; tool: string; mode?: "proxy"|"native" }) => {
    const qs = new URLSearchParams();
    if (q.server_id) qs.set("server_id", q.server_id);
    if (q.server_name) qs.set("server_name", q.server_name);
    if (q.tool) qs.set("tool", q.tool);
    if (q.mode) qs.set("mode", q.mode);
    return fetchApi(`/api/mcp/inspector/tool/call/stream?${qs}`);
  },
  toolCallCancel: (req: any) => fetchApi(`/api/mcp/inspector/tool/call/cancel`, { method: "POST", body: JSON.stringify(req) }),
  resourcesList: (q: { server_id?: string; server_name?: string; mode?: "proxy"|"native"; refresh?: boolean }) => {
    const qs = new URLSearchParams();
    if (q.server_id) qs.set("server_id", q.server_id);
    if (q.server_name) qs.set("server_name", q.server_name);
    if (q.mode) qs.set("mode", q.mode);
    if (q.refresh != null) qs.set("refresh", String(q.refresh));
    return fetchApi(`/api/mcp/inspector/resource/list?${qs}`);
  },
  resourceRead: (q: { uri: string; server_id?: string; server_name?: string; mode?: "proxy"|"native" }) => {
    const qs = new URLSearchParams({ uri: q.uri });
    if (q.server_id) qs.set("server_id", q.server_id);
    if (q.server_name) qs.set("server_name", q.server_name);
    if (q.mode) qs.set("mode", q.mode);
    return fetchApi(`/api/mcp/inspector/resource/read?${qs}`);
  },
  promptsList: (q: { server_id?: string; server_name?: string; mode?: "proxy"|"native"; refresh?: boolean }) => {
    const qs = new URLSearchParams();
    if (q.server_id) qs.set("server_id", q.server_id);
    if (q.server_name) qs.set("server_name", q.server_name);
    if (q.mode) qs.set("mode", q.mode);
    if (q.refresh != null) qs.set("refresh", String(q.refresh));
    return fetchApi(`/api/mcp/inspector/prompt/list?${qs}`);
  },
  promptGet: (req: { name: string; server_id?: string; server_name?: string; arguments?: Record<string, any>; mode?: "proxy"|"native" }) =>
    fetchApi(`/api/mcp/inspector/prompt/get`, { method: "POST", body: JSON.stringify(req) }),
  callsRecent: () => fetchApi(`/api/mcp/inspector/calls/recent`),
  callsDetails: (q: { id: string }) => fetchApi(`/api/mcp/inspector/calls/details?id=${encodeURIComponent(q.id)}`),
  callsClear: () => fetchApi(`/api/mcp/inspector/calls/clear`, { method: "POST", body: JSON.stringify({}) }),
};

// Tools Management API
export const toolsApi = {
	getAll: async () => {
		try {
			// Try to get tools from active profile first
			const suitsResponse = await configSuitsApi.getAll();
			const active = suitsResponse?.suits?.find((s) => s.is_active);
			if (active) {
				try {
					const q = new URLSearchParams({ profile_id: active.id });
					const resp = await fetchApi<
						ApiWrapper<{
							profile_id: string;
							profile_name: string;
							tools: SuitTool[];
						}>
					>(`/api/mcp/profile/tools/list?${q}`);
					const data = extractApiData(resp);
					if (data?.tools) {
						const tools = data.tools.map((tool) => ({
							tool_name: tool.tool_name || tool.name || "",
							server_name: tool.server_name || "",
							is_enabled:
								(tool as any).is_enabled ?? (tool as any).enabled ?? true,
							description: (tool as any).description || "",
							tool_id: (tool as any).id || "",
						}));
						return { tools };
					}
				} catch (e) {
					console.error("Failed to fetch profile tools:", e);
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

	// Deprecated helpers removed; use configSuitsApi instead

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
	_manageTool: async (
		profileId: string,
		toolId: string,
		action: "enable" | "disable",
	) =>
		fetchApi<ApiResponse<null>>("/api/mcp/profile/tools/manage", {
			method: "POST",
			body: JSON.stringify({
				profile_id: profileId,
				component_ids: [toolId],
				action,
			}),
		}),

	enableTool: (profileId: string, toolId: string) =>
		toolsApi._manageTool(profileId, toolId, "enable"),

	disableTool: (profileId: string, toolId: string) =>
		toolsApi._manageTool(profileId, toolId, "disable"),
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
				ApiWrapper<{ profile: any[]; total: number; timestamp: string }>
			>("/api/mcp/profile/list");
			const data = extractApiData(response);
			const suits: ConfigSuit[] = (data.profile || []).map((p: any) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? undefined,
				suit_type: p.profile_type,
				multi_select: p.multi_select,
				priority: p.priority,
				is_active: p.is_active,
				is_default: p.is_default,
				allowed_operations: p.allowed_operations || [],
			}));
			return { suits };
		} catch (error) {
			console.error("Failed to fetch config suits:", error);
			return { suits: [] };
		}
	},
	// Server capabilities
	listTools: async (serverId: string, refresh?: "auto" | "force" | "cache") => {
		const q = new URLSearchParams({ id: serverId });
		if (refresh) q.set("refresh", refresh);
		const resp = await fetchApi<ServerCapabilityResp>(
			`/api/mcp/servers/tools?${q}`,
		);
		return extractApiData(resp);
	},
	listResources: async (
		serverId: string,
		refresh?: "auto" | "force" | "cache",
	) => {
		const q = new URLSearchParams({ id: serverId });
		if (refresh) q.set("refresh", refresh);
		const resp = await fetchApi<ServerCapabilityResp>(
			`/api/mcp/servers/resources?${q}`,
		);
		return extractApiData(resp);
	},
	listPrompts: async (
		serverId: string,
		refresh?: "auto" | "force" | "cache",
	) => {
		const q = new URLSearchParams({ id: serverId });
		if (refresh) q.set("refresh", refresh);
		const resp = await fetchApi<ServerCapabilityResp>(
			`/api/mcp/servers/prompts?${q}`,
		);
		return extractApiData(resp);
	},
	listResourceTemplates: async (
		serverId: string,
		refresh?: "auto" | "force" | "cache",
	) => {
		const q = new URLSearchParams({ id: serverId });
		if (refresh) q.set("refresh", refresh);
		const resp = await fetchApi<ServerCapabilityResp>(
			`/api/mcp/servers/resources/templates?${q}`,
		);
		return extractApiData(resp);
	},

	getSuit: async (id: string): Promise<ConfigSuit> => {
		const q = new URLSearchParams({ id });
		const response = await fetchApi<ApiWrapper<{ profile: any }>>(
			`/api/mcp/profile/details?${q}`,
		);
		const data = extractApiData(response);
		const p = (data as any).profile;
		return {
			id: p.id,
			name: p.name,
			description: p.description ?? undefined,
			suit_type: p.profile_type,
			multi_select: p.multi_select,
			priority: p.priority,
			is_active: p.is_active,
			is_default: p.is_default,
			allowed_operations: p.allowed_operations || [],
		} as ConfigSuit;
	},

	createSuit: async (
		data: CreateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		const payload = {
			name: data.name,
			description: data.description ?? null,
			profile_type: data.suit_type,
			multi_select: data.multi_select ?? null,
			priority: data.priority ?? null,
			is_active: data.is_active ?? null,
			is_default: data.is_default ?? null,
			clone_from_id: data.clone_from_id ?? null,
		};
		const response = await fetchApi<ApiWrapper<any>>(
			"/api/mcp/profile/create",
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
		);
		const p = extractApiData(response);
		const result: ConfigSuit = {
			id: p.id,
			name: p.name,
			description: p.description ?? undefined,
			suit_type: p.profile_type,
			multi_select: p.multi_select,
			priority: p.priority,
			is_active: p.is_active,
			is_default: p.is_default,
			allowed_operations: p.allowed_operations || [],
		};
		return { status: "success", message: "Profile created", data: result };
	},

	updateSuit: async (
		id: string,
		data: UpdateConfigSuitRequest,
	): Promise<ApiResponse<ConfigSuit>> => {
		const payload = {
			id,
			name: data.name ?? null,
			description: data.description ?? null,
			profile_type: (data as any).suit_type ?? null,
			multi_select: data.multi_select ?? null,
			priority: data.priority ?? null,
			is_active: data.is_active ?? null,
			is_default: data.is_default ?? null,
		};
		const response = await fetchApi<ApiWrapper<any>>(
			`/api/mcp/profile/update`,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
		);
		const p = extractApiData(response);
		const result: ConfigSuit = {
			id: p.id,
			name: p.name,
			description: p.description ?? undefined,
			suit_type: p.profile_type,
			multi_select: p.multi_select,
			priority: p.priority,
			is_active: p.is_active,
			is_default: p.is_default,
			allowed_operations: p.allowed_operations || [],
		};
		return { status: "success", message: "Profile updated", data: result };
	},

	deleteSuit: async (id: string): Promise<ApiResponse<void>> => {
		const response = await fetchApi<ApiWrapper<void>>(
			`/api/mcp/profile/delete`,
			{
				method: "DELETE",
				body: JSON.stringify({ id }),
			},
		);
		extractApiData(response);
		return {
			status: "success",
			message: "Config suit deleted successfully",
		};
	},

	// Suit management operations
	_manageSuit: async (id: string, action: "activate" | "deactivate") => {
		const response = await fetchApi<ApiWrapper<unknown>>(
			"/api/mcp/profile/manage",
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
		const q = new URLSearchParams({ profile_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				profile_id: string;
				profile_name: string;
				servers: ConfigSuitServer[];
			}>
		>(`/api/mcp/profile/servers/list?${q}`);
		const data = extractApiData(response);
		return {
			suit_id: (data as any).profile_id,
			suit_name: (data as any).profile_name,
			servers: (data as any).servers || [],
		};
	},

	getTools: async (suitId: string): Promise<ConfigSuitToolsResponse> => {
		const q = new URLSearchParams({ profile_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				profile_id: string;
				profile_name: string;
				tools: ConfigSuitTool[];
			}>
		>(`/api/mcp/profile/tools/list?${q}`);
		const data = extractApiData(response);
		return {
			suit_id: (data as any).profile_id,
			suit_name: (data as any).profile_name,
			tools: (data as any).tools || [],
		};
	},

	getResources: async (
		suitId: string,
	): Promise<ConfigSuitResourcesResponse> => {
		const q = new URLSearchParams({ profile_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				profile_id: string;
				profile_name: string;
				resources: any[];
			}>
		>(`/api/mcp/profile/resources/list?${q}`);
		const data = extractApiData(response);
		return {
			suit_id: (data as any).profile_id,
			suit_name: (data as any).profile_name,
			resources: (data as any).resources || [],
		};
	},

	getPrompts: async (suitId: string): Promise<ConfigSuitPromptsResponse> => {
		const q = new URLSearchParams({ profile_id: suitId });
		const response = await fetchApi<
			ApiWrapper<{
				profile_id: string;
				profile_name: string;
				prompts: any[];
			}>
		>(`/api/mcp/profile/prompts/list?${q}`);
		const data = extractApiData(response);
		return {
			suit_id: (data as any).profile_id,
			suit_name: (data as any).profile_name,
			prompts: (data as any).prompts || [],
		};
	},

	// Component management operations
	_manageComponent: (
		endpoint: "servers" | "tools" | "resources" | "prompts",
		suitId: string,
		componentId: string,
		action: "enable" | "disable",
	) =>
		fetchApi<ApiResponse<null>>(`/api/mcp/profile/${endpoint}/manage`, {
			method: "POST",
			body: JSON.stringify({
				profile_id: suitId,
				component_ids: [componentId],
				action,
			}),
		}),

	// Batch manage multiple component ids in one request for reliability/perf
	_manageComponentsBatch: (
		endpoint: "servers" | "tools" | "resources" | "prompts",
		suitId: string,
		componentIds: string[],
		action: "enable" | "disable",
	) =>
		fetchApi<ApiResponse<null>>(`/api/mcp/profile/${endpoint}/manage`, {
			method: "POST",
			body: JSON.stringify({
				profile_id: suitId,
				component_ids: componentIds,
				action,
			}),
		}),

	enableServer: (suitId: string, serverId: string) =>
		configSuitsApi._manageComponent("servers", suitId, serverId, "enable"),
	disableServer: (suitId: string, serverId: string) =>
		configSuitsApi._manageComponent("servers", suitId, serverId, "disable"),
	// Some backends only support single-id manage for servers; do per-id with best-effort batching
	bulkServers: async (
		suitId: string,
		ids: string[],
		action: "enable" | "disable",
	) =>
		executeBatchOperation(ids, (id) =>
			configSuitsApi._manageComponent("servers", suitId, id, action),
		),
	enableTool: (suitId: string, toolId: string) =>
		configSuitsApi._manageComponent("tools", suitId, toolId, "enable"),
	disableTool: (suitId: string, toolId: string) =>
		configSuitsApi._manageComponent("tools", suitId, toolId, "disable"),
	bulkTools: (suitId: string, ids: string[], action: "enable" | "disable") =>
		configSuitsApi._manageComponentsBatch("tools", suitId, ids, action),
	enableResource: (suitId: string, resourceId: string) =>
		configSuitsApi._manageComponent("resources", suitId, resourceId, "enable"),
	disableResource: (suitId: string, resourceId: string) =>
		configSuitsApi._manageComponent("resources", suitId, resourceId, "disable"),
	bulkResources: (
		suitId: string,
		ids: string[],
		action: "enable" | "disable",
	) => configSuitsApi._manageComponentsBatch("resources", suitId, ids, action),
	enablePrompt: (suitId: string, promptId: string) =>
		configSuitsApi._manageComponent("prompts", suitId, promptId, "enable"),
	disablePrompt: (suitId: string, promptId: string) =>
		configSuitsApi._manageComponent("prompts", suitId, promptId, "disable"),
	bulkPrompts: (suitId: string, ids: string[], action: "enable" | "disable") =>
		configSuitsApi._manageComponentsBatch("prompts", suitId, ids, action),
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

		const wsUrl = resolveWebSocketUrl();
		if (!wsUrl) {
			console.warn("WebSocket URL could not be resolved; skipping connection attempt");
			return;
		}
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

// Clients Management API
export const clientsApi = {
	list: async (refresh = false) => {
		const q = new URLSearchParams({ refresh: String(refresh) });
		const resp = await fetchApi<ClientCheckResp>(`/api/client/list?${q}`);
		return extractApiData(resp);
	},

	manage: async (identifier: string, action: ClientManageAction) => {
		const resp = await fetchApi<ClientManageResp>("/api/client/manage", {
			method: "POST",
			body: JSON.stringify({ identifier, action }),
		});
		return extractApiData(resp);
	},

	configDetails: async (identifier: string, doImport = false) => {
		const q = new URLSearchParams({ identifier, import: String(doImport) });
		const resp = await fetchApi<ClientConfigResp>(
			`/api/client/config/details?${q}`,
		);
		return extractApiData(resp);
	},

	applyConfig: async (payload: ClientConfigUpdateReq) => {
		const resp = await fetchApi<ClientConfigUpdateResp>(
			`/api/client/config/apply`,
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
		);
		return extractApiData(resp);
	},

	restoreConfig: async (payload: ClientConfigRestoreReq) => {
		const resp = await fetchApi<ClientBackupActionResp>(
			`/api/client/config/restore`,
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
		);
		return extractApiData(resp);
	},

	listBackups: async (identifier?: string) => {
		const q = new URLSearchParams();
		if (identifier) q.set("identifier", identifier);
		const resp = await fetchApi<ClientBackupListResp>(
			`/api/client/backups/list?${q}`,
		);
		return extractApiData(resp);
	},

	deleteBackup: async (identifier: string, backup: string) => {
		const resp = await fetchApi<ClientBackupActionResp>(
			`/api/client/backups/delete`,
			{
				method: "POST",
				body: JSON.stringify({ identifier, backup }),
			},
		);
		return extractApiData(resp);
	},

	getBackupPolicy: async (identifier: string) => {
		const q = new URLSearchParams({ identifier });
		const resp = await fetchApi<ClientBackupPolicyResp>(
			`/api/client/backups/policy?${q}`,
		);
		return extractApiData(resp);
	},

	setBackupPolicy: async (payload: ClientBackupPolicySetReq) => {
		const resp = await fetchApi<ClientBackupPolicyResp>(
			`/api/client/backups/policy`,
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
		);
		return extractApiData(resp);
	},

	// Import servers from an existing client configuration (preview or apply)
	importFromClient: async (
		identifier: string,
		options?: { preview?: boolean; profile_id?: string | null },
	) => {
		const body: any = { identifier };
		if (options && typeof options.preview === "boolean")
			body.preview = options.preview;
		if (options && "profile_id" in options)
			body.profile_id = options.profile_id;
		const resp = await fetchApi(`/api/client/config/import`, {
			method: "POST",
			body: JSON.stringify(body),
		});
		return extractApiData(resp as any);
	},
};
