import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	PlayCircle,
	RefreshCw,
	StopCircle,
	XCircle,
	ExternalLink,
	MoreHorizontal,
	Edit3,
	Play,
	Square,
	Trash2,
	Check,
} from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { StatusBadge } from "../../components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { serversApi } from "../../lib/api";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { useToast } from "../../components/ui/use-toast";
// serversApi already imported above
import { ServerFormDrawer } from "../../components/server-form-drawer";

export function ServerDetailPage() {
	const { serverId } = useParams<{ serverId: string }>();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	// State management
	const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	// Force cleanup when drawer closes to prevent overlay issues
	useEffect(() => {
		if (!isEditDrawerOpen) {
			// 使用 requestAnimationFrame 确保在正确时机清理
			requestAnimationFrame(() => {
				setTimeout(() => {
					// 清理所有可能的遮罩层和覆盖元素
					const overlays = document.querySelectorAll(
						"[data-radix-popper-content-wrapper], [data-radix-dialog-overlay], [data-vaul-overlay], [data-vaul-drawer-wrapper], .fixed.inset-0, [data-vaul-drawer]",
					);
					overlays.forEach((overlay) => {
						const element = overlay as HTMLElement;
						if (
							element.getAttribute("data-state") === "closed" ||
							!element.closest('[data-state="open"]') ||
							element.style.pointerEvents === "none"
						) {
							element.remove();
						}
					});

					// 确保 body 样式被正确重置
					document.body.style.removeProperty("pointer-events");
					document.body.style.removeProperty("overflow");
					document.body.removeAttribute("data-scroll-locked");
					document.body.removeAttribute("aria-hidden");
					document.body.removeAttribute("data-vaul-drawer-wrapper");
				}, 50);
			});
		}
	}, [isEditDrawerOpen]);

	const {
		data: server,
		isLoading,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: ["server", serverId],
		queryFn: () => serversApi.getServer(serverId || ""),
		enabled: !!serverId,
		refetchInterval: 15000,
	});

	// Server toggle mutation (start/stop)
	const serverToggleMutation = useMutation({
		mutationFn: async (action: "start" | "stop") => {
			if (!serverId) throw new Error("Server ID is required");

			if (action === "start") {
				return await serversApi.startServer(serverId);
			} else {
				return await serversApi.stopServer(serverId);
			}
		},
		onSuccess: (_, action) => {
			toast({
				title: `Server ${action === "start" ? "Started" : "Stopped"}`,
				description: `Server has been ${action === "start" ? "started" : "stopped"} successfully`,
			});
			queryClient.invalidateQueries({ queryKey: ["server", serverId] });
		},
		onError: (error, action) => {
			toast({
				title: "Operation Failed",
				description: `Unable to ${action} server: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Server delete mutation
	const deleteServerMutation = useMutation({
		mutationFn: async () => {
			if (!serverId) throw new Error("Server ID is required");
			return await serversApi.deleteServer(serverId);
		},
		onSuccess: () => {
			toast({
				title: "Server Deleted",
				description: "Server has been deleted successfully",
			});
			navigate("/servers");
		},
		onError: (error) => {
			toast({
				title: "Delete Failed",
				description: `Unable to delete server: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Instance operation mutation
	const instanceMutation = useMutation({
		mutationFn: async ({
			action,
			instanceId,
		}: {
			action: "disconnect" | "reconnect" | "reset" | "cancel";
			instanceId: string;
		}) => {
			if (!serverId) throw new Error("Server ID is required");

			switch (action) {
				case "disconnect":
					return await serversApi.disconnectInstance(serverId, instanceId);
				case "reconnect":
					return await serversApi.reconnectInstance(serverId, instanceId);
				case "reset":
					return await serversApi.resetAndReconnectInstance(
						serverId,
						instanceId,
					);
				case "cancel":
					return await serversApi.cancelInstance(serverId, instanceId);
				default:
					throw new Error(`Unknown action: ${action}`);
			}
		},
		onSuccess: (_, variables) => {
			const actionMap = {
				disconnect: "Disconnected",
				reconnect: "Reconnected",
				reset: "Reset and reconnected",
				cancel: "Canceled",
			};

			toast({
				title: `Instance ${actionMap[variables.action]}`,
				description: `Instance ${variables.instanceId.substring(0, 8)}... was ${actionMap[variables.action].toLowerCase()} successfully`,
			});

			queryClient.invalidateQueries({ queryKey: ["server", serverId] });
		},
		onError: (error, variables) => {
			toast({
				title: "Operation Failed",
				description: `Unable to ${
					variables.action === "disconnect"
						? "disconnect"
						: variables.action === "reconnect"
							? "reconnect"
							: variables.action === "reset"
								? "reset"
								: "cancel"
				} instance: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Handle functions
	const handleRefresh = () => {
		refetch();
	};

	const handleServerToggle = () => {
		if (!server) return;

		// Determine action based on server status
		const isRunning =
			server.status?.toLowerCase() === "ready" ||
			server.status?.toLowerCase() === "busy" ||
			server.instances.some(
				(i) =>
					i.status?.toLowerCase() === "ready" ||
					i.status?.toLowerCase() === "busy",
			);

		serverToggleMutation.mutate(isRunning ? "stop" : "start");
	};

	const handleEdit = () => {
		setIsEditDrawerOpen(true);
	};

	const handleEditDrawerClose = (open: boolean) => {
		setIsEditDrawerOpen(open);
		if (!open) {
			// 使用 requestAnimationFrame 确保在正确的时机执行清理
			requestAnimationFrame(() => {
				setTimeout(() => {
					// 全面清理 body 的样式和属性
					document.body.style.removeProperty("pointer-events");
					document.body.style.removeProperty("overflow");
					document.body.style.removeProperty("padding-right");
					document.body.removeAttribute("data-scroll-locked");
					document.body.removeAttribute("aria-hidden");
					document.body.removeAttribute("data-vaul-drawer-wrapper");
					document.documentElement.removeAttribute("aria-hidden");

					// 清理可能的遮罩层和覆盖元素
					const overlays = document.querySelectorAll(
						"[data-radix-popper-content-wrapper], [data-radix-dialog-overlay], [data-vaul-overlay], [data-vaul-drawer-wrapper], .fixed.inset-0",
					);
					overlays.forEach((overlay) => {
						const element = overlay as HTMLElement;
						if (
							element.getAttribute("data-state") === "closed" ||
							!element.closest('[data-state="open"]') ||
							element.style.pointerEvents === "none"
						) {
							element.remove();
						}
					});

					// 强制重置焦点和交互能力
					document.body.focus();

					// 确保页面可以正常交互
					document.body.style.pointerEvents = "";

					// 触发重新渲染以确保状态正确
					document.body.offsetHeight;
				}, 100);
			});
		}
	};

	const handleDelete = () => {
		setIsDeleteDialogOpen(true);
	};

	const confirmDelete = () => {
		deleteServerMutation.mutate();
		setIsDeleteDialogOpen(false);
	};

	// Convert server data to MCPServerConfig format for ServerFormDrawer
	const convertToMCPConfig = (serverData: any) => {
		return {
			name: serverData.name || "",
			command: serverData.command || "",
			command_path: serverData.commandPath || "",
			args: Array.isArray(serverData.args)
				? serverData.args
				: typeof serverData.args === "string"
					? serverData.args.split(" ").filter(Boolean)
					: [],
			env: serverData.env || {},
			max_instances: serverData.max_instances || 1,
			kind: serverData.kind || "stdio",
		};
	};

	// Handle instance action
	const handleInstanceAction = (
		action: "disconnect" | "reconnect" | "reset" | "cancel",
		instanceId: string,
	) => {
		instanceMutation.mutate({ action, instanceId });
	};

	if (!serverId) {
		return <div>No server ID provided</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					{server && (
						<div className="flex items-center gap-3">
							<div className="flex flex-col">
								<div className="flex items-center gap-3">
									<h2 className="text-3xl font-bold tracking-tight uppercase">
										{server.name}
									</h2>
									<Badge variant="outline">{server.kind}</Badge>
									<StatusBadge
										status={
											typeof server.status === "string"
												? server.status.toLowerCase()
												: "unknown"
										}
										instances={server.instances.map((instance) => ({
											...instance,
											status:
												typeof instance.status === "string"
													? instance.status.toLowerCase()
													: "unknown",
										}))}
										blinkOnError={true}
									/>
									{server.instances.some(
										(i) =>
											i.status?.toLowerCase() === "ready" ||
											i.status?.toLowerCase() === "busy",
									) && (
										<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
											<Check className="mr-1 h-3 w-3" />
											Running
										</span>
									)}
								</div>
							</div>
						</div>
					)}
				</div>
				<div className="flex gap-2">
					{server && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									<MoreHorizontal className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={5}>
								<DropdownMenuItem
									onClick={handleRefresh}
									disabled={isRefetching}
								>
									<RefreshCw
										className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
									/>
									Refresh
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleEdit}>
									<Edit3 className="mr-2 h-4 w-4" />
									Edit
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={handleServerToggle}
									disabled={serverToggleMutation.isPending}
								>
									{server.instances.some(
										(i) =>
											i.status?.toLowerCase() === "ready" ||
											i.status?.toLowerCase() === "busy",
									) ? (
										<>
											<Square className="mr-2 h-4 w-4" />
											Stop
										</>
									) : (
										<>
											<Play className="mr-2 h-4 w-4" />
											Start
										</>
									)}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={handleDelete}
									className="text-destructive focus:text-destructive"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>

			{isLoading ? (
				<Card>
					<CardContent className="p-6">
						<div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
					</CardContent>
				</Card>
			) : server ? (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Server Configuration</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-4 md:grid-cols-2">
								<div>
									<h3 className="mb-2 text-sm font-medium text-slate-500">
										Basic Information
									</h3>
									<dl className="space-y-2">
										<div className="flex justify-between">
											<dt className="font-medium">Name:</dt>
											<dd>{server.name}</dd>
										</div>
										<div className="flex justify-between">
											<dt className="font-medium">Type:</dt>
											<dd>{server.kind}</dd>
										</div>
										<div className="flex justify-between">
											<dt className="font-medium">Status:</dt>
											<dd>
												<StatusBadge
													status={server.status}
													instances={server.instances}
													blinkOnError={true}
												/>
											</dd>
										</div>
										<div className="flex justify-between">
											<dt className="font-medium">Active Instances:</dt>
											<dd>{server.instances.length}</dd>
										</div>
									</dl>
								</div>

								{server.command && (
									<div>
										<h3 className="mb-2 text-sm font-medium text-slate-500">
											Command Configuration
										</h3>
										<dl className="space-y-2">
											<div className="flex justify-between">
												<dt className="font-medium">Command:</dt>
												<dd className="font-mono text-sm">{server.command}</dd>
											</div>
											{server.commandPath && (
												<div className="flex justify-between">
													<dt className="font-medium">Path:</dt>
													<dd className="font-mono text-sm">
														{server.commandPath}
													</dd>
												</div>
											)}
											{server.args && server.args.length > 0 && (
												<div className="flex justify-between">
													<dt className="font-medium">Arguments:</dt>
													<dd className="font-mono text-sm">
														{server.args.join(" ")}
													</dd>
												</div>
											)}
										</dl>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Instances ({server.instances.length})</CardTitle>
							<CardDescription>
								List of all instances for this server
							</CardDescription>
						</CardHeader>
						<CardContent>
							{server.instances.length > 0 ? (
								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{server.instances.map((instance) => (
										<Card key={instance.id} className="overflow-hidden">
											<CardHeader className="p-4">
												<div className="flex items-center justify-between">
													<CardTitle
														className="text-sm font-medium truncate"
														title={instance.id}
													>
														{instance.id.substring(0, 8)}...
													</CardTitle>
													<StatusBadge
														status={
															typeof instance.status === "string"
																? instance.status.toLowerCase()
																: "unknown"
														}
														blinkOnError={
															typeof instance.status === "string" &&
															instance.status.toLowerCase() === "error"
														}
													/>
												</div>
											</CardHeader>
											<CardContent className="p-4 pt-0">
												<div className="space-y-3">
													<div>
														<div className="mb-2 flex items-center justify-between text-xs text-slate-500">
															<span>Status:</span>
															<span>{instance.status}</span>
														</div>
														<div className="flex justify-between text-xs text-slate-500">
															<span>ID:</span>
															<span className="font-mono">
																{instance.id.substring(0, 12)}
															</span>
														</div>
													</div>
													<div className="flex flex-col gap-3 mt-4">
														{/* Action buttons */}
														<div className="flex justify-between gap-2">
															<Link
																to={`/servers/${serverId}/instances/${instance.id}`}
																className="flex-1"
															>
																<Button
																	variant="outline"
																	size="sm"
																	className="w-full"
																>
																	<ExternalLink className="mr-2 h-4 w-4" />
																	Details
																</Button>
															</Link>

															{instance.status.toLowerCase() === "ready" ||
															instance.status.toLowerCase() === "busy" ? (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() =>
																		handleInstanceAction(
																			"disconnect",
																			instance.id,
																		)
																	}
																	disabled={instanceMutation.isPending}
																	className="flex-1"
																>
																	<StopCircle className="mr-2 h-4 w-4" />
																	Disconnect
																</Button>
															) : null}
														</div>

														{/* Reconnect button - shown for error or shutdown states */}
														{instance.status.toLowerCase() === "error" ||
														instance.status.toLowerCase() === "shutdown" ? (
															<Button
																variant="default"
																size="sm"
																onClick={() =>
																	handleInstanceAction("reconnect", instance.id)
																}
																disabled={instanceMutation.isPending}
																className="w-full"
															>
																<PlayCircle className="mr-2 h-4 w-4" />
																Reconnect
															</Button>
														) : null}

														{/* Cancel button - shown for initializing state */}
														{instance.status.toLowerCase() ===
														"initializing" ? (
															<Button
																variant="outline"
																size="sm"
																onClick={() =>
																	handleInstanceAction("cancel", instance.id)
																}
																disabled={instanceMutation.isPending}
																className="w-full"
															>
																<XCircle className="mr-2 h-4 w-4" />
																Cancel
															</Button>
														) : null}
													</div>
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							) : (
								<p className="text-center text-slate-500">
									This server has no available instances.
								</p>
							)}
						</CardContent>
					</Card>
				</>
			) : (
				<Card>
					<CardContent className="p-6">
						<p className="text-center text-slate-500">
							Server not found or error loading server details.
						</p>
					</CardContent>
				</Card>
			)}

			{/* Server Edit Drawer */}
			{server && (
				<ServerFormDrawer
					isOpen={isEditDrawerOpen}
					onClose={() => handleEditDrawerClose(false)}
					initialData={convertToMCPConfig(server)}
					onSubmit={async (data) => {
						try {
							await serversApi.updateServer(serverId!, data);
							setIsEditDrawerOpen(false);
							queryClient.invalidateQueries({ queryKey: ["server", serverId] });
							toast({
								title: "Server Updated",
								description:
									"Server configuration has been updated successfully",
							});
						} catch (error) {
							toast({
								title: "Update Failed",
								description: `Unable to update server: ${error instanceof Error ? error.message : String(error)}`,
								variant: "destructive",
							});
						}
					}}
					title="Edit Server"
					submitLabel="Update"
					isEditing={true}
				/>
			)}

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Server</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this server? This action cannot be
							undone. All instances will be stopped and the server configuration
							will be removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteServerMutation.isPending}
						>
							{deleteServerMutation.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

		{/* Tabs: Overview + Capabilities */}
		{server && (
			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="capabilities">Capabilities</TabsTrigger>
				</TabsList>

				<TabsContent value="overview">
					{/* Existing overview content remains above (header + instances) */}
				</TabsContent>

				<TabsContent value="capabilities">
					<div className="grid gap-4">
						{/* Nested tabs for capabilities */}
						<Tabs defaultValue="tools">
							<TabsList>
								<TabsTrigger value="tools">Tools</TabsTrigger>
								<TabsTrigger value="resources">Resources</TabsTrigger>
								<TabsTrigger value="prompts">Prompts</TabsTrigger>
								<TabsTrigger value="templates">Resource Templates</TabsTrigger>
							</TabsList>

							{/* Tools */}
							<TabsContent value="tools">
								<CapabilityList serverId={serverId!} kind="tools" />
							</TabsContent>

							{/* Resources */}
							<TabsContent value="resources">
								<CapabilityList serverId={serverId!} kind="resources" />
							</TabsContent>

							{/* Prompts */}
							<TabsContent value="prompts">
								<CapabilityList serverId={serverId!} kind="prompts" />
							</TabsContent>

							{/* Templates */}
							<TabsContent value="templates">
								<CapabilityList serverId={serverId!} kind="templates" />
							</TabsContent>
						</Tabs>
					</div>
				</TabsContent>
			</Tabs>
		)}

	</div>
	);
}

// Capability list section component
function CapabilityList({ serverId, kind }: { serverId: string; kind: "tools" | "resources" | "prompts" | "templates" }) {
  const qk = ["server-capability", kind, serverId] as const;
  const query = useQuery({
    queryKey: qk,
    queryFn: async () => {
      switch (kind) {
        case "tools":
          return await serversApi.listTools(serverId);
        case "resources":
          return await serversApi.listResources(serverId);
        case "prompts":
          return await serversApi.listPrompts(serverId);
        case "templates":
          return await serversApi.listResourceTemplates(serverId);
      }
    },
  });

  const items: any[] = (query.data?.items as any[]) || [];
  const meta: any = query.data?.meta;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="capitalize">{kind}</span>
          <div className="text-xs text-slate-500">
            {meta ? (
              <span>
                source: {meta.source} • strategy: {meta.strategy} • cache_hit: {String(meta.cache_hit)}
              </span>
            ) : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />)}
          </div>
        ) : items.length ? (
          <div className="space-y-2">
            {items.map((it, idx) => {
              const title = it.tool_name || it.name || it.id || it.uri || it.resource_uri || `#${idx+1}`;
              const desc = it.description || it.details || "";
              return (
                <div key={idx} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{String(title)}</div>
                    {typeof it.enabled === 'boolean' && (
                      <span className="text-xs px-2 py-0.5 rounded-full border">
                        {it.enabled ? 'enabled' : 'disabled'}
                      </span>
                    )}
                  </div>
                  {desc ? <p className="text-xs text-slate-500 mt-1">{String(desc)}</p> : null}
                  {/* Fallback JSON for unknown schemas */}
                  <pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto">
                    {JSON.stringify(it, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No data.</p>
        )}
      </CardContent>
    </Card>
  );
}
