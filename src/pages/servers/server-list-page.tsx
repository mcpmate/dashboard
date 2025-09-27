import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	Bug,
	Edit,
	Eye,
	Plus,
	Power,
	PowerOff,
	RefreshCw,
	Trash,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ErrorDisplay } from "../../components/error-display";
import { ServerFormDrawer } from "../../components/server-form-drawer";
import { StatusBadge } from "../../components/status-badge";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { notifyError, notifySuccess } from "../../lib/notify";
import { configSuitsApi, serversApi } from "../../lib/api";
import type {
	MCPServerConfig,
	ServerDetail,
	ServerListResponse,
	ServerSummary,
} from "../../lib/types";

// (Removed) isServerActive helper was unused; layout simplified

// Helper function to get the instance count for a server
function getInstanceCount(server: ServerSummary): number {
	// If server has instances array, use its length
	if (server.instances && Array.isArray(server.instances)) {
		return server.instances.length;
	}

	// If server has instance_count property, use it
	if (typeof server.instance_count === "number") {
		return server.instance_count;
	}

	// Default to 0 if no instance information is available
	return 0;
}

export function ServerListPage() {
	const navigate = useNavigate();
	const [debugInfo, setDebugInfo] = useState<string | null>(null);
	const [isAddServerOpen, setIsAddServerOpen] = useState(false);
	const [editingServer, setEditingServer] = useState<ServerDetail | null>(null);
	const [deletingServer, setDeletingServer] = useState<string | null>(null);
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
	const [isDeleteLoading, setIsDeleteLoading] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [pending, setPending] = useState<Record<string, boolean>>({});

	const queryClient = useQueryClient();

	const {
		data: serverListResponse,
		isLoading,
		refetch,
		isRefetching,
		error,
		isError,
	} = useQuery<ServerListResponse>({
		queryKey: ["servers"],
		queryFn: async () => {
			try {
				// Add debug information
				console.log("Fetching servers...");
				const result = await serversApi.getAll();
				console.log("Servers fetched:", result);
				return result;
			} catch (err) {
				console.error("Error fetching servers:", err);
				// Capture error information for display
				setDebugInfo(
					err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err),
				);
				throw err;
			}
		},
		refetchInterval: 30000,
		retry: 1, // Reduce retry count to show errors more quickly
	});

	const { data: profileUsage } = useQuery<{ [serverId: string]: string[] }>({
		queryKey: ["servers", "profile-usage"],
		queryFn: async () => {
			try {
				const suits = await configSuitsApi.getAll();
				const active = suits.suits.filter((s) => s.is_active);
				const mapping: Record<string, string[]> = {};
				await Promise.all(
					active.map(async (suit) => {
						try {
							const res = await configSuitsApi.getServers(suit.id);
							(res.servers || []).forEach((srv) => {
								if (srv.enabled) {
									if (!mapping[srv.id]) mapping[srv.id] = [];
									mapping[srv.id].push(suit.name || suit.id);
								}
							});
						} catch (error) {
							console.error(
								"Failed loading servers for profile",
								suit.id,
								error,
							);
						}
					}),
				);
				return mapping;
			} catch (error) {
				console.error("Failed to resolve profile usage", error);
				return {};
			}
		},
		staleTime: 30000,
	});

	// Server details query
	const getServerDetails = async (serverId: string) => {
		try {
			return await serversApi.getServer(serverId);
		} catch (error) {
			console.error(`Error fetching server details for ${serverId}:`, error);
			return null;
		}
	};

	// Enable/disable server
	async function toggleServerAsync(
		serverId: string,
		enable: boolean,
		sync?: boolean,
	) {
		setPending((p) => ({ ...p, [serverId]: true }));
		try {
			if (enable) await serversApi.enableServer(serverId, sync);
			else await serversApi.disableServer(serverId, sync);
			notifySuccess(
				enable ? "Server enabled" : "Server disabled",
				`Server ${serverId}`,
			);
			queryClient.invalidateQueries({ queryKey: ["servers"] });
			setTimeout(
				() => queryClient.invalidateQueries({ queryKey: ["servers"] }),
				1000,
			);
		} catch (error) {
			notifyError(
				"Operation failed",
				`Unable to ${enable ? "enable" : "disable"} server: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setPending((p) => ({ ...p, [serverId]: false }));
		}
	}

	// Note: Reconnect functionality is moved to instance-level pages

	// Create server
	const createServerMutation = useMutation({
		mutationFn: async (serverConfig: Partial<MCPServerConfig>) => {
			return await serversApi.createServer(serverConfig);
		},
		onSuccess: () => {
			notifySuccess(
				"Server created",
				"New server has been successfully created",
			);
			queryClient.invalidateQueries({ queryKey: ["servers"] });
		},
		onError: (error) => {
			notifyError(
				"Create failed",
				`Unable to create server: ${error instanceof Error ? error.message : String(error)}`,
			);
		},
	});

	// Update server
	const updateServerMutation = useMutation({
		mutationFn: async ({
			serverId,
			config,
		}: {
			serverId: string;
			config: Partial<MCPServerConfig>;
		}) => {
			return await serversApi.updateServer(serverId, config);
		},
		onSuccess: (_, variables) => {
			notifySuccess("Server updated", `Server ${variables.serverId}`);
			queryClient.invalidateQueries({ queryKey: ["servers"] });
		},
		onError: (error, variables) => {
			notifyError(
				"Update failed",
				`Unable to update ${variables.serverId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		},
	});

	// Handle add server
	const handleAddServer = async (serverConfig: Partial<MCPServerConfig>) => {
		await createServerMutation.mutateAsync(serverConfig);
		setIsAddServerOpen(false);
	};

	// Handle edit server
	const handleEditServer = async (serverId: string) => {
		const serverDetails = await getServerDetails(serverId);
		if (serverDetails) {
			setEditingServer(serverDetails);
		} else {
			notifyError(
				"Fetch failed",
				`Unable to get details for server ${serverId}`,
			);
		}
	};

	// Handle update server
	const handleUpdateServer = async (config: Partial<MCPServerConfig>) => {
		if (editingServer) {
			console.log("Updating server:", editingServer.id, "with config:", config);
			try {
				await updateServerMutation.mutateAsync({
					serverId: editingServer.id,
					config,
				});
				console.log("Server update successful");
				setEditingServer(null);
			} catch (error) {
				console.error("Server update failed:", error);
				throw error; // Re-throw to let the mutation handle it
			}
		}
	};

	// Convert ServerDetail to MCPServerConfig for form
	const convertToMCPConfig = (
		server: ServerDetail,
	): Partial<MCPServerConfig> => {
		return {
			name: server.name,
			kind: (server.server_type || server.kind) as
				| "stdio"
				| "sse"
				| "streamable_http",
			command: server.command,
			args: server.args,
			env: server.env,
		};
	};

	// Handle delete server
	const handleDeleteServer = async () => {
		if (!deletingServer) return;

		setIsDeleteLoading(true);
		setDeleteError(null);

		try {
			await serversApi.deleteServer(deletingServer);
			notifySuccess("Server deleted", `Server ${deletingServer}`);
			queryClient.invalidateQueries({ queryKey: ["servers"] });
			setIsDeleteConfirmOpen(false);
			setDeletingServer(null);
		} catch (error) {
			setDeleteError(
				error instanceof Error ? error.message : "Error deleting server",
			);
		} finally {
			setIsDeleteLoading(false);
		}
	};

	const renderServerCard = (server: ServerSummary) => {
		const profileRefs = profileUsage?.[server.id] ?? [];
		return (
			<Card
				key={server.id}
				className="group overflow-hidden cursor-pointer hover:border-primary/40 transition-shadow hover:shadow-lg"
				role="button"
				tabIndex={0}
				onClick={(e) => {
					const target = e.target as HTMLElement;
					if (target.closest('button, a, input, [role="switch"]')) return;
					navigate(`/servers/${encodeURIComponent(server.id)}`);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						navigate(`/servers/${encodeURIComponent(server.id)}`);
					}
				}}
			>
				<CardHeader className="p-4 flex flex-row justify-between items-start">
					<div className="flex items-start gap-3">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-lg font-semibold">
							{(server.name || server.id || "S").slice(0, 1).toUpperCase()}
						</div>
						<div>
							<CardTitle className="text-xl leading-tight">
								{server.name}
							</CardTitle>
							<CardDescription className="flex flex-col mt-1 space-y-1">
								<span>
									Type: {server.server_type || server.kind || "Unknown"}
								</span>
								<span>Instances: {getInstanceCount(server)}</span>
								{server.enabled !== undefined ? (
									<span>Status: {server.enabled ? "Enabled" : "Disabled"}</span>
								) : null}
							</CardDescription>
						</div>
					</div>
					<StatusBadge
						status={server.status}
						instances={server.instances}
						blinkOnError={["error", "unhealthy", "stopped", "failed"].includes(
							(server.status || "").toLowerCase(),
						)}
						isServerEnabled={server.enabled}
					/>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<div className="flex flex-col gap-3">
						<div className="flex justify-between items-center mt-4">
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={(ev) => {
										ev.stopPropagation();
										toggleServerAsync(
											server.id,
											!server.enabled,
											false, // TODO: Add sync to all clients
										);
									}}
									disabled={!!pending[server.id]}
									title={server.enabled ? "Disable Server" : "Enable Server"}
								>
									{server.enabled ? (
										<PowerOff className="h-4 w-4" />
									) : (
										<Power className="h-4 w-4" />
									)}
								</Button>
								<div className="flex gap-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
									<Button
										size="sm"
										variant="outline"
										onClick={(ev) => {
											ev.stopPropagation();
											handleEditServer(server.id);
										}}
										title="Edit server configuration"
									>
										<Edit className="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={(ev) => {
											ev.stopPropagation();
											setDeletingServer(server.id);
											setIsDeleteConfirmOpen(true);
										}}
										title="Delete server"
									>
										<Trash className="h-4 w-4" />
									</Button>
								</div>
							</div>
							<div className="flex gap-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
								<Button
									size="sm"
									variant="outline"
									className="gap-1"
									onClick={(ev) => {
										ev.stopPropagation();
										const targetChannel =
											profileRefs.length > 0 ? "proxy" : "native";
										if (typeof window !== "undefined") {
											const url = `/servers/${encodeURIComponent(server.id)}?view=debug&channel=${targetChannel}`;
											window.open(url, "_blank", "noopener,noreferrer");
										}
									}}
									title="Open debug view"
								>
									<Bug className="h-4 w-4" /> Debug
								</Button>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	};

	// Add debug button handler
	const toggleDebugInfo = () => {
		if (debugInfo) {
			setDebugInfo(null);
		} else {
			setDebugInfo(
				`API Base URL: ${window.location.origin}\n` +
					`Current Time: ${new Date().toISOString()}\n` +
					`Error: ${error instanceof Error ? error.message : String(error)}\n` +
					`Servers Data: ${JSON.stringify(serverListResponse, null, 2)}`,
			);
		}
	};

	return (
		<div className="space-y-6">
			{/* Page header */}
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-3xl font-bold tracking-tight">Servers</h2>
				{/* Right side header controls: sync toggle + actions in one row */}
				<div className="flex items-center gap-3 whitespace-nowrap">
					<div className="flex items-center gap-2">
						<Button
							onClick={() => refetch()}
							disabled={isRefetching}
							variant="outline"
							size="sm"
						>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
							/>
							Refresh
						</Button>
						<Button onClick={() => setIsAddServerOpen(true)} size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Server
						</Button>
					</div>
				</div>
			</div>

			{/* Summary cards row */}
			<div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				<Card className="flex flex-col">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Total Servers</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="text-2xl font-bold">
							{serverListResponse?.servers?.length || 0}
						</div>
						<CardDescription>registered</CardDescription>
					</CardContent>
				</Card>
				<Card className="flex flex-col">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Enabled</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="text-2xl font-bold">
							{
								(serverListResponse?.servers || []).filter((s) => s.enabled)
									.length
							}
						</div>
						<CardDescription>feature toggled</CardDescription>
					</CardContent>
				</Card>
				<Card className="flex flex-col">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Connected</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="text-2xl font-bold">
							{
								(serverListResponse?.servers || []).filter(
									(s) => String(s.status || "").toLowerCase() === "connected",
								).length
							}
						</div>
						<CardDescription>active connections</CardDescription>
					</CardContent>
				</Card>
				<Card className="flex flex-col">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Instances</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="text-2xl font-bold">
							{(serverListResponse?.servers || []).reduce(
								(sum, s) => sum + (s.instances?.length || 0),
								0,
							)}
						</div>
						<CardDescription>total across servers</CardDescription>
					</CardContent>
				</Card>
				{/* Actions moved to page header; remove action card */}
			</div>

			{isError && (
				<Button onClick={toggleDebugInfo} variant="outline" size="sm">
					<AlertCircle className="mr-2 h-4 w-4" />
					{debugInfo ? "Hide Debug" : "Debug"}
				</Button>
			)}

			{/* Display error information */}
			{isError && (
				<ErrorDisplay
					title="Failed to load servers"
					error={error as Error}
					onRetry={() => refetch()}
				/>
			)}

			{/* Display debug information */}
			{debugInfo && (
				<Card className="overflow-hidden">
					<CardHeader className="bg-slate-100 dark:bg-slate-800 p-4">
						<CardTitle className="text-lg flex justify-between">
							Debug Information
							<Button
								onClick={() => setDebugInfo(null)}
								variant="ghost"
								size="sm"
							>
								Close
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4">
						<pre className="whitespace-pre-wrap text-xs overflow-auto max-h-96">
							{debugInfo}
						</pre>
					</CardContent>
				</Card>
			)}

			{/* List container card for consistency */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{isLoading ? (
					// Loading skeleton
					Array.from({ length: 6 }).map((_, i) => (
						<Card key={i} className="overflow-hidden">
							<CardHeader className="p-4">
								<div className="h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								<div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
							</CardHeader>
							<CardContent className="p-4 pt-0">
								<div className="mt-2 flex justify-between">
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
									<div className="h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								</div>
							</CardContent>
						</Card>
					))
				) : serverListResponse?.servers?.length ? (
					serverListResponse.servers.map(renderServerCard)
				) : (
					<div className="col-span-full">
						<Card>
							<CardContent className="flex flex-col items-center justify-center p-6">
								<p className="mb-2 text-center text-slate-500">
									{isError
										? "Failed to load servers, please check the error message above."
										: "No servers found. Please ensure the backend service is running and servers are configured."}
								</p>
								<Button
									onClick={() => setIsAddServerOpen(true)}
									size="sm"
									className="mt-4"
								>
									<Plus className="mr-2 h-4 w-4" />
									Add First Server
								</Button>
							</CardContent>
						</Card>
					</div>
				)}
			</div>

			{/* Add server drawer */}
			<ServerFormDrawer
				isOpen={isAddServerOpen}
				onClose={() => setIsAddServerOpen(false)}
				onSubmit={handleAddServer}
				title="Add New Server"
				enableImportTab
				onImported={() =>
					queryClient.invalidateQueries({ queryKey: ["servers"] })
				}
			/>

			{/* Edit server drawer */}
			{editingServer && (
				<ServerFormDrawer
					isOpen={!!editingServer}
					onClose={() => setEditingServer(null)}
					onSubmit={handleUpdateServer}
					initialData={convertToMCPConfig(editingServer)}
					title={`Edit Server: ${editingServer.name}`}
					isEditing={true}
				/>
			)}

			{/* Import moved into Add Server drawer (tabs) */}

			{/* Delete confirmation dialog */}
			<ConfirmDialog
				isOpen={isDeleteConfirmOpen}
				onClose={() => {
					setIsDeleteConfirmOpen(false);
					setDeleteError(null);
				}}
				onConfirm={handleDeleteServer}
				title="Delete Server"
				description={`Are you sure you want to delete the server "${deletingServer}"? This action cannot be undone.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="destructive"
				isLoading={isDeleteLoading}
				error={deleteError}
			/>
		</div>
	);
}
