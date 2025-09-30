import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	Bug,
	Edit,
	Plus,
	Power,
	PowerOff,
	RefreshCw,
	Server,
	Trash,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import {
	PageLayout,
	StatsCard,
	EmptyState,
} from "../../components/page-layout";
import { ListGridContainer } from "../../components/list-grid-container";
import { configSuitsApi, serversApi } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";
import { useAppStore } from "../../lib/store";
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

	// View mode and developer toggles
	const defaultView = useAppStore(
		(state) => state.dashboardSettings.defaultView,
	);
	const enableServerDebug = useAppStore(
		(state) => state.dashboardSettings.enableServerDebug,
	);
	const openDebugInNewWindow = useAppStore(
		(state) => state.dashboardSettings.openDebugInNewWindow,
	);

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

	const renderServerListItem = (server: ServerSummary) => {
		const profileRefs = profileUsage?.[server.id] ?? [];
		return (
			<div
				key={server.id}
				className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 cursor-pointer shadow-[0_4px_12px_-10px_rgba(15,23,42,0.2)] transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_4px_12px_-10px_rgba(15,23,42,0.5)]"
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
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-lg font-semibold">
						{(server.name || server.id || "S").slice(0, 1).toUpperCase()}
					</div>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h3 className="font-medium text-sm leading-tight">
								{server.name}
							</h3>
							<StatusBadge
								status={server.status}
								instances={server.instances}
								blinkOnError={[
									"error",
									"unhealthy",
									"stopped",
									"failed",
								].includes((server.status || "").toLowerCase())}
								isServerEnabled={server.enabled}
							/>
						</div>
						<div className="flex flex-wrap gap-4 text-xs text-slate-400">
							<span>
								Type: {server.server_type || server.kind || "Unknown"}
							</span>
							<span>Instances: {getInstanceCount(server)}</span>
							{server.enabled !== undefined ? (
								<span>Status: {server.enabled ? "Enabled" : "Disabled"}</span>
							) : null}
						</div>
						{profileRefs.length > 0 && (
							<div className="flex flex-wrap gap-1 text-xs text-slate-500">
								<span>Profiles: {profileRefs.join(", ")}</span>
							</div>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					{enableServerDebug && (
						<Button
							size="sm"
							variant="outline"
							className="gap-1"
							onClick={(ev) => {
								ev.stopPropagation();
								const targetChannel =
									profileRefs.length > 0 ? "proxy" : "native";
								const url = `/servers/${encodeURIComponent(server.id)}?view=debug&channel=${targetChannel}`;
								if (openDebugInNewWindow) {
									if (typeof window !== "undefined") {
										window.open(url, "_blank", "noopener,noreferrer");
									}
									return;
								}
								navigate(url);
							}}
							title="Open debug view"
						>
							<Bug className="h-4 w-4" /> Debug
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						onClick={(ev) => {
							ev.stopPropagation();
							setEditingServer(server as any);
						}}
						title="Edit server"
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
		);
	};

	const renderServerCard = (server: ServerSummary) => {
		const profileRefs = profileUsage?.[server.id] ?? [];
		return (
			<Card
				key={server.id}
				className="group overflow-hidden cursor-pointer shadow-[0_4px_12px_-10px_rgba(15,23,42,0.2)] hover:border-primary/40 transition-shadow hover:shadow-lg dark:shadow-[0_4px_12px_-10px_rgba(15,23,42,0.5)]"
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
						<div className="flex justify-between items-center">
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
								{enableServerDebug && (
									<Button
										size="sm"
										variant="outline"
										className="gap-1"
										onClick={(ev) => {
											ev.stopPropagation();
											const targetChannel =
												profileRefs.length > 0 ? "proxy" : "native";
											const url = `/servers/${encodeURIComponent(server.id)}?view=debug&channel=${targetChannel}`;
											if (openDebugInNewWindow) {
												if (typeof window !== "undefined") {
													window.open(url, "_blank", "noopener,noreferrer");
												}
												return;
											}
											navigate(url);
										}}
										title="Open debug view"
									>
										<Bug className="h-4 w-4" /> Debug
									</Button>
								)}
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

	// Prepare stats cards data
	const statsCards = [
		{
			title: "Total Servers",
			value: serverListResponse?.servers?.length || 0,
			description: "registered",
		},
		{
			title: "Enabled",
			value: (serverListResponse?.servers || []).filter((s) => s.enabled)
				.length,
			description: "feature toggled",
		},
		{
			title: "Connected",
			value: (serverListResponse?.servers || []).filter(
				(s) => String(s.status || "").toLowerCase() === "connected",
			).length,
			description: "active connections",
		},
		{
			title: "Instances",
			value: (serverListResponse?.servers || []).reduce(
				(sum, s) => sum + (s.instances?.length || 0),
				0,
			),
			description: "total across servers",
		},
	];

	// Prepare loading skeleton
	const loadingSkeleton =
		defaultView === "grid"
			? Array.from({ length: 6 }, (_, index) => (
					<Card key={`loading-grid-${index}`} className="overflow-hidden">
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
			: Array.from({ length: 3 }, (_, index) => (
					<div
						key={`loading-suit-${index}`}
						className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
					>
						<div className="flex items-center gap-3">
							<div className="h-11 w-11 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800"></div>
							<div className="space-y-2">
								<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								<div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
							</div>
						</div>
						<div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
					</div>
				));

	// Prepare empty state
	const emptyState = (
		<Card>
			<CardContent className="flex flex-col items-center justify-center p-6">
				<EmptyState
					icon={<Server className="h-12 w-12" />}
					title="No servers found"
					description="Add your first MCP server to get started"
					action={
						<Button
							onClick={() => setIsAddServerOpen(true)}
							size="sm"
							className="mt-4"
						>
							<Plus className="mr-2 h-4 w-4" />
							Add First Server
						</Button>
					}
				/>
			</CardContent>
		</Card>
	);

	return (
		<PageLayout
			title="Servers"
			headerActions={
				<div className="flex items-center gap-2">
					{isError && enableServerDebug && (
						<Button onClick={toggleDebugInfo} variant="outline" size="sm">
							<AlertCircle className="mr-2 h-4 w-4" />
							{debugInfo ? "Hide Debug" : "Debug"}
						</Button>
					)}
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
			}
			statsCards={statsCards.map((stat) => (
				<StatsCard
					key={stat.title}
					title={stat.title}
					value={stat.value}
					description={stat.description}
				/>
			))}
		>
			{isError && enableServerDebug && (
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

			<ListGridContainer
				loading={isLoading}
				loadingSkeleton={loadingSkeleton}
				emptyState={
					serverListResponse?.servers?.length === 0 ? emptyState : undefined
				}
			>
				{defaultView === "grid"
					? serverListResponse?.servers?.map(renderServerCard)
					: serverListResponse?.servers?.map(renderServerListItem)}
			</ListGridContainer>

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
		</PageLayout>
	);
}
