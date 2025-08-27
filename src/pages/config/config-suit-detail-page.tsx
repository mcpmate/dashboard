import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Edit3,
	FileText,
	Play,
	RefreshCw,
	Server,
	Square,
	Wrench,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { SuitFormDrawer } from "../../components/suit-form-drawer";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../components/ui/tabs";
import { useToast } from "../../components/ui/use-toast";
import { configSuitsApi } from "../../lib/api";
import type {
	ConfigSuitPrompt,
	ConfigSuitResource,
	ConfigSuitServer,
	ConfigSuitTool,
} from "../../lib/types";

export function ConfigSuitDetailPage() {
	const { suitId } = useParams<{ suitId: string }>();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	// Filters: servers
	const [serverQuery, setServerQuery] = useState("");
	const [serverStatus, setServerStatus] = useState<
		"all" | "enabled" | "disabled"
	>("all");
	// Filters: tools
	const [toolQuery, setToolQuery] = useState("");
	const [toolStatus, setToolStatus] = useState<"all" | "enabled" | "disabled">(
		"all",
	);
	const [toolServer, setToolServer] = useState<string>("all");
	// Filters: resources
	const [resourceQuery, setResourceQuery] = useState("");
	const [resourceStatus, setResourceStatus] = useState<
		"all" | "enabled" | "disabled"
	>("all");
	const [resourceServer, setResourceServer] = useState<string>("all");
	// Filters: prompts
	const [promptQuery, setPromptQuery] = useState("");
	const [promptStatus, setPromptStatus] = useState<
		"all" | "enabled" | "disabled"
	>("all");
	const [promptServer, setPromptServer] = useState<string>("all");

	// Do not early-return before hooks; guard queries with `enabled`

	// Fetch config suit details
	const {
		data: suit,
		isLoading: isLoadingSuit,
		refetch: refetchSuit,
		isRefetching: isRefetchingSuit,
		error: suitError,
	} = useQuery({
		queryKey: ["configSuit", suitId],
		queryFn: async () => {
			if (!suitId) return undefined;
			console.log("Fetching config suit details for:", suitId);
			const result = await configSuitsApi.getSuit(suitId);
			console.log("Config suit details response:", result);
			return result;
		},
		enabled: !!suitId,
		retry: 1,
	});

	// Fetch servers in suit
	const {
		data: serversResponse,
		isLoading: isLoadingServers,
		refetch: refetchServers,
		error: serversError,
	} = useQuery({
		queryKey: ["configSuitServers", suitId],
		queryFn: async () => {
			if (!suitId) return undefined;
			console.log("Fetching servers for config suit:", suitId);
			const result = await configSuitsApi.getServers(suitId);
			console.log("Config suit servers response:", result);
			return result;
		},
		enabled: !!suitId,
		retry: 1,
	});
	// Fetch tools in suit
	const {
		data: toolsResponse,
		isLoading: isLoadingTools,
		refetch: refetchTools,
	} = useQuery({
		queryKey: ["configSuitTools", suitId],
		queryFn: () =>
			suitId ? configSuitsApi.getTools(suitId) : Promise.resolve(undefined),
		enabled: !!suitId,
		retry: 1,
	});

	// Fetch resources in suit
	const {
		data: resourcesResponse,
		isLoading: isLoadingResources,
		refetch: refetchResources,
	} = useQuery({
		queryKey: ["configSuitResources", suitId],
		queryFn: () =>
			suitId ? configSuitsApi.getResources(suitId) : Promise.resolve(undefined),
		enabled: !!suitId,
		retry: 1,
	});

	// Fetch prompts in suit
	const {
		data: promptsResponse,
		isLoading: isLoadingPrompts,
		refetch: refetchPrompts,
	} = useQuery({
		queryKey: ["configSuitPrompts", suitId],
		queryFn: () =>
			suitId ? configSuitsApi.getPrompts(suitId) : Promise.resolve(undefined),
		enabled: !!suitId,
		retry: 1,
	});

	// Activation/deactivation mutations
	const activateSuitMutation = useMutation({
		mutationFn: () => configSuitsApi.activateSuit(suitId!),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuit", suitId] });
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			toast({
				title: "Config Suit Activated",
				description: "Configuration suit has been successfully activated",
			});
		},
		onError: (error) => {
			toast({
				title: "Activation Failed",
				description: `Failed to activate config suit: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	const deactivateSuitMutation = useMutation({
		mutationFn: () => configSuitsApi.deactivateSuit(suitId!),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuit", suitId] });
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			toast({
				title: "Config Suit Deactivated",
				description: "Configuration suit has been successfully deactivated",
			});
		},
		onError: (error) => {
			toast({
				title: "Deactivation Failed",
				description: `Failed to deactivate config suit: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Server toggle mutations
	const serverToggleMutation = useMutation({
		mutationFn: ({
			serverId,
			enable,
		}: {
			serverId: string;
			enable: boolean;
		}) => {
			return enable
				? configSuitsApi.enableServer(suitId!, serverId)
				: configSuitsApi.disableServer(suitId!, serverId);
		},
		onSuccess: () => {
			refetchServers();
			toast({
				title: "Server Updated",
				description: "Server status has been updated successfully",
			});
		},
		onError: (error) => {
			toast({
				title: "Server Update Failed",
				description: `Failed to update server: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Tool toggle mutations
	const toolToggleMutation = useMutation({
		mutationFn: ({ toolId, enable }: { toolId: string; enable: boolean }) => {
			return enable
				? configSuitsApi.enableTool(suitId!, toolId)
				: configSuitsApi.disableTool(suitId!, toolId);
		},
		onSuccess: () => {
			refetchTools();
			toast({
				title: "Tool Updated",
				description: "Tool status has been updated successfully",
			});
		},
		onError: (error) => {
			toast({
				title: "Tool Update Failed",
				description: `Failed to update tool: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Resource toggle mutations
	const resourceToggleMutation = useMutation({
		mutationFn: ({
			resourceId,
			enable,
		}: {
			resourceId: string;
			enable: boolean;
		}) => {
			return enable
				? configSuitsApi.enableResource(suitId!, resourceId)
				: configSuitsApi.disableResource(suitId!, resourceId);
		},
		onSuccess: () => {
			refetchResources();
			toast({
				title: "Resource Updated",
				description: "Resource status has been updated successfully",
			});
		},
		onError: (error) => {
			toast({
				title: "Resource Update Failed",
				description: `Failed to update resource: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	// Prompt toggle mutations
	const promptToggleMutation = useMutation({
		mutationFn: ({
			promptId,
			enable,
		}: {
			promptId: string;
			enable: boolean;
		}) => {
			return enable
				? configSuitsApi.enablePrompt(suitId!, promptId)
				: configSuitsApi.disablePrompt(suitId!, promptId);
		},
		onSuccess: () => {
			refetchPrompts();
			toast({
				title: "Prompt Updated",
				description: "Prompt status has been updated successfully",
			});
		},
		onError: (error) => {
			toast({
				title: "Prompt Update Failed",
				description: `Failed to update prompt: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	const handleSuitToggle = () => {
		if (suit?.is_active) {
			deactivateSuitMutation.mutate();
		} else {
			activateSuitMutation.mutate();
		}
	};

	const handleRefreshAll = () => {
		refetchSuit();
		refetchServers();
		refetchTools();
		refetchResources();
		refetchPrompts();
	};

	const servers = (serversResponse?.servers ?? []) as ConfigSuitServer[];
	const tools = (toolsResponse?.tools ?? []) as ConfigSuitTool[];
	const resources = (resourcesResponse?.resources ??
		[]) as ConfigSuitResource[];
	const prompts = (promptsResponse?.prompts ?? []) as ConfigSuitPrompt[];

	const enabledServers = servers.filter((s: ConfigSuitServer) => s.enabled);
	const enabledTools = tools.filter((t: ConfigSuitTool) => t.enabled);
	const enabledResources = resources.filter(
		(r: ConfigSuitResource) => r.enabled,
	);
	const enabledPrompts = prompts.filter((p: ConfigSuitPrompt) => p.enabled);

	// Derived server name options for filters
	const serverNameOptions = Array.from(
		new Set(
			[
				...servers.map((s: ConfigSuitServer) => s.name),
				...tools.map((t: ConfigSuitTool) => t.server_name),
				...resources.map((r: ConfigSuitResource) => r.server_name),
				...prompts.map((p: ConfigSuitPrompt) => p.server_name),
			].filter(Boolean),
		),
	).sort();

	// Filtered datasets
	const visibleServers = servers.filter((s: ConfigSuitServer) => {
		const queryPass =
			serverQuery.trim() === "" ||
			s.name.toLowerCase().includes(serverQuery.toLowerCase());
		const statusPass =
			serverStatus === "all" ||
			(serverStatus === "enabled" ? s.enabled : !s.enabled);
		return queryPass && statusPass;
	});

	const visibleTools = tools.filter((t: ConfigSuitTool) => {
		const text =
			`${t.tool_name ?? ""} ${t.unique_name ?? ""} ${t.server_name ?? ""}`.toLowerCase();
		const queryPass =
			toolQuery.trim() === "" || text.includes(toolQuery.toLowerCase());
		const statusPass =
			toolStatus === "all" ||
			(toolStatus === "enabled" ? t.enabled : !t.enabled);
		const serverPass = toolServer === "all" || t.server_name === toolServer;
		return queryPass && statusPass && serverPass;
	});

	const visibleResources = resources.filter((r: ConfigSuitResource) => {
		const text = `${r.resource_uri ?? ""} ${r.server_name ?? ""}`.toLowerCase();
		const queryPass =
			resourceQuery.trim() === "" || text.includes(resourceQuery.toLowerCase());
		const statusPass =
			resourceStatus === "all" ||
			(resourceStatus === "enabled" ? r.enabled : !r.enabled);
		const serverPass =
			resourceServer === "all" || r.server_name === resourceServer;
		return queryPass && statusPass && serverPass;
	});

	const visiblePrompts = prompts.filter((p: ConfigSuitPrompt) => {
		const text = `${p.prompt_name ?? ""} ${p.server_name ?? ""}`.toLowerCase();
		const queryPass =
			promptQuery.trim() === "" || text.includes(promptQuery.toLowerCase());
		const statusPass =
			promptStatus === "all" ||
			(promptStatus === "enabled" ? p.enabled : !p.enabled);
		const serverPass = promptServer === "all" || p.server_name === promptServer;
		return queryPass && statusPass && serverPass;
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					{suit && (
						<div className="flex items-center gap-3">
							<div className="flex flex-col">
								<div className="flex items-center gap-3">
									<h2 className="text-3xl font-bold tracking-tight uppercase">
										{suit.name}
									</h2>
									<Badge variant={suit.is_active ? "default" : "secondary"}>
										{suit.suit_type}
									</Badge>
									{suit.is_active && (
										<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
											<Check className="mr-1 h-3 w-3" />
											Active
										</span>
									)}
									{suit.is_default && <Badge variant="outline">Default</Badge>}
								</div>
								{suit.description && (
									<p className="text-sm text-muted-foreground mt-1">
										{suit.description}
									</p>
								)}
							</div>
						</div>
					)}
				</div>
				<div className="flex gap-2">
					<Button
						onClick={handleRefreshAll}
						disabled={isRefetchingSuit}
						variant="outline"
						size="sm"
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${isRefetchingSuit ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
					{suit && (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIsEditDialogOpen(true)}
							>
								<Edit3 className="mr-2 h-4 w-4" />
								Edit
							</Button>
							<Button
								onClick={handleSuitToggle}
								disabled={
									activateSuitMutation.isPending ||
									deactivateSuitMutation.isPending
								}
								variant={suit.is_active ? "destructive" : "default"}
								size="sm"
							>
								{suit.is_active ? (
									<>
										<Square className="mr-2 h-4 w-4" />
										Deactivate
									</>
								) : (
									<>
										<Play className="mr-2 h-4 w-4" />
										Activate
									</>
								)}
							</Button>
						</>
					)}
				</div>
			</div>

			{!suitId ? (
				<Card>
					<CardContent className="p-6">
						<p className="text-center text-slate-500">
							Config suit ID not provided
						</p>
					</CardContent>
				</Card>
			) : isLoadingSuit ? (
				<Card>
					<CardContent className="p-6">
						<div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
					</CardContent>
				</Card>
			) : suit ? (
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="space-y-6"
				>
					<TabsList className="grid w-full grid-cols-5">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="servers">
							Servers ({servers.length})
						</TabsTrigger>
						<TabsTrigger value="tools">Tools ({tools.length})</TabsTrigger>
						<TabsTrigger value="resources">
							Resources ({resources.length})
						</TabsTrigger>
						<TabsTrigger value="prompts">
							Prompts ({prompts.length})
						</TabsTrigger>
					</TabsList>

					<TabsContent value="overview">
						<div className="grid gap-6">
							<Card>
								<CardHeader>
									<CardTitle>Configuration Suit Details</CardTitle>
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
													<dd>{suit.name}</dd>
												</div>
												<div className="flex justify-between">
													<dt className="font-medium">Type:</dt>
													<dd>{suit.suit_type}</dd>
												</div>
												<div className="flex justify-between">
													<dt className="font-medium">Status:</dt>
													<dd>
														<Badge
															variant={suit.is_active ? "default" : "secondary"}
														>
															{suit.is_active ? "Active" : "Inactive"}
														</Badge>
													</dd>
												</div>
												<div className="flex justify-between">
													<dt className="font-medium">Priority:</dt>
													<dd>{suit.priority}</dd>
												</div>
											</dl>
										</div>
										<div>
											<h3 className="mb-2 text-sm font-medium text-slate-500">
												Configuration
											</h3>
											<dl className="space-y-2">
												<div className="flex justify-between">
													<dt className="font-medium">Multi-select:</dt>
													<dd>{suit.multi_select ? "Yes" : "No"}</dd>
												</div>
												<div className="flex justify-between">
													<dt className="font-medium">Default:</dt>
													<dd>{suit.is_default ? "Yes" : "No"}</dd>
												</div>
											</dl>
										</div>
									</div>
								</CardContent>
							</Card>

							<div className="grid gap-4 md:grid-cols-4">
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Servers</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledServers.length}/{servers.length}
										</div>
										<p className="text-xs text-muted-foreground">enabled</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Tools</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledTools.length}/{tools.length}
										</div>
										<p className="text-xs text-muted-foreground">enabled</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Resources</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledResources.length}/{resources.length}
										</div>
										<p className="text-xs text-muted-foreground">enabled</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Prompts</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledPrompts.length}/{prompts.length}
										</div>
										<p className="text-xs text-muted-foreground">enabled</p>
									</CardContent>
								</Card>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="servers">
						<Card>
							<CardHeader>
								<CardTitle>Servers</CardTitle>
								<CardDescription>
									Manage servers included in this configuration suit
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* Filters Row */}
								{!isLoadingServers && (
									<div className="mb-4 grid gap-2 md:grid-cols-3">
										<Input
											placeholder="Search by name..."
											value={serverQuery}
											onChange={(e) => setServerQuery(e.target.value)}
										/>
										<Select
											value={serverStatus}
											onValueChange={(v) =>
												setServerStatus(v as "all" | "enabled" | "disabled")
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="enabled">Enabled</SelectItem>
												<SelectItem value="disabled">Disabled</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
								{isLoadingServers ? (
									<div className="space-y-4">
										{["s1", "s2", "s3"].map((id) => (
											<div
												key={`servers-skel-${id}`}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
												<div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											</div>
										))}
									</div>
								) : visibleServers.length > 0 ? (
									<div className="space-y-4">
										{visibleServers.map((server) => (
											<div
												key={server.id}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<Server className="h-5 w-5 text-slate-500" />
													<div>
														<h3 className="font-medium">{server.name}</h3>
														<p className="text-sm text-slate-500">
															ID: {server.id}
														</p>
													</div>
													{server.enabled && (
														<Badge variant="default" className="ml-2">
															Enabled
														</Badge>
													)}
												</div>
												<Switch
													checked={server.enabled}
													onCheckedChange={(enabled) =>
														serverToggleMutation.mutate({
															serverId: server.id,
															enable: enabled,
														})
													}
													disabled={serverToggleMutation.isPending}
												/>
											</div>
										))}
									</div>
								) : (
									<p className="text-center text-slate-500 py-8">
										No servers found in this configuration suit
									</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="tools">
						<Card>
							<CardHeader>
								<CardTitle>Tools</CardTitle>
								<CardDescription>
									Manage tools included in this configuration suit
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* Filters Row */}
								{!isLoadingTools && (
									<div className="mb-4 grid gap-2 md:grid-cols-3 lg:grid-cols-4">
										<Input
											placeholder="Search tool or unique name..."
											value={toolQuery}
											onChange={(e) => setToolQuery(e.target.value)}
										/>
										<Select
											value={toolStatus}
											onValueChange={(v) =>
												setToolStatus(v as "all" | "enabled" | "disabled")
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="enabled">Enabled</SelectItem>
												<SelectItem value="disabled">Disabled</SelectItem>
											</SelectContent>
										</Select>
										<Select
											value={toolServer}
											onValueChange={(v) => setToolServer(v)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Server" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Servers</SelectItem>
												{serverNameOptions.map((name) => (
													<SelectItem key={`tool-sel-${name}`} value={name}>
														{name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								{isLoadingTools ? (
									<div className="space-y-4">
										{["t1", "t2", "t3"].map((id) => (
											<div
												key={`tools-skel-${id}`}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
												<div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											</div>
										))}
									</div>
								) : visibleTools.length > 0 ? (
									<div className="space-y-4">
										{visibleTools.map((tool) => (
											<div
												key={tool.id}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<Wrench className="h-5 w-5 text-slate-500" />
													<div>
														<h3 className="font-medium">{tool.tool_name}</h3>
														<p className="text-sm text-slate-500">
															Server: {tool.server_name}
															{tool.unique_name &&
																` • Unique: ${tool.unique_name}`}
														</p>
													</div>
													{tool.enabled && (
														<Badge variant="default" className="ml-2">
															Enabled
														</Badge>
													)}
												</div>
												<Switch
													checked={tool.enabled}
													onCheckedChange={(enabled) =>
														toolToggleMutation.mutate({
															toolId: tool.id,
															enable: enabled,
														})
													}
													disabled={toolToggleMutation.isPending}
												/>
											</div>
										))}
									</div>
								) : (
									<p className="text-center text-slate-500 py-8">
										No tools found in this configuration suit
									</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="resources">
						<Card>
							<CardHeader>
								<CardTitle>Resources</CardTitle>
								<CardDescription>
									Manage resources included in this configuration suit
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* Filters Row */}
								{!isLoadingResources && (
									<div className="mb-4 grid gap-2 md:grid-cols-3 lg:grid-cols-4">
										<Input
											placeholder="Search by URI..."
											value={resourceQuery}
											onChange={(e) => setResourceQuery(e.target.value)}
										/>
										<Select
											value={resourceStatus}
											onValueChange={(v) =>
												setResourceStatus(v as "all" | "enabled" | "disabled")
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="enabled">Enabled</SelectItem>
												<SelectItem value="disabled">Disabled</SelectItem>
											</SelectContent>
										</Select>
										<Select
											value={resourceServer}
											onValueChange={(v) => setResourceServer(v)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Server" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Servers</SelectItem>
												{serverNameOptions.map((name) => (
													<SelectItem key={`res-sel-${name}`} value={name}>
														{name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								{isLoadingResources ? (
									<div className="space-y-4">
										{["r1", "r2", "r3"].map((id) => (
											<div
												key={`resources-skel-${id}`}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
												<div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											</div>
										))}
									</div>
								) : visibleResources.length > 0 ? (
									<div className="space-y-4">
										{visibleResources.map((resource) => (
											<div
												key={resource.id}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<FileText className="h-5 w-5 text-slate-500" />
													<div>
														<h3 className="font-medium">
															{resource.resource_uri}
														</h3>
														<p className="text-sm text-slate-500">
															Server: {resource.server_name}
														</p>
													</div>
													{resource.enabled && (
														<Badge variant="default" className="ml-2">
															Enabled
														</Badge>
													)}
												</div>
												<Switch
													checked={resource.enabled}
													onCheckedChange={(enabled) =>
														resourceToggleMutation.mutate({
															resourceId: resource.id,
															enable: enabled,
														})
													}
													disabled={resourceToggleMutation.isPending}
												/>
											</div>
										))}
									</div>
								) : (
									<p className="text-center text-slate-500 py-8">
										No resources found in this configuration suit
									</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="prompts">
						<Card>
							<CardHeader>
								<CardTitle>Prompts</CardTitle>
								<CardDescription>
									Manage prompts included in this configuration suit
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* Filters Row */}
								{!isLoadingPrompts && (
									<div className="mb-4 grid gap-2 md:grid-cols-3 lg:grid-cols-4">
										<Input
											placeholder="Search by prompt name..."
											value={promptQuery}
											onChange={(e) => setPromptQuery(e.target.value)}
										/>
										<Select
											value={promptStatus}
											onValueChange={(v) =>
												setPromptStatus(v as "all" | "enabled" | "disabled")
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="enabled">Enabled</SelectItem>
												<SelectItem value="disabled">Disabled</SelectItem>
											</SelectContent>
										</Select>
										<Select
											value={promptServer}
											onValueChange={(v) => setPromptServer(v)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Server" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Servers</SelectItem>
												{serverNameOptions.map((name) => (
													<SelectItem key={`prm-sel-${name}`} value={name}>
														{name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								{isLoadingPrompts ? (
									<div className="space-y-4">
										{["p1", "p2", "p3"].map((id) => (
											<div
												key={`prompts-skel-${id}`}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
												<div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											</div>
										))}
									</div>
								) : visiblePrompts.length > 0 ? (
									<div className="space-y-4">
										{visiblePrompts.map((prompt) => (
											<div
												key={prompt.id}
												className="flex items-center justify-between rounded-lg border p-4"
											>
												<div className="flex items-center gap-3">
													<Zap className="h-5 w-5 text-slate-500" />
													<div>
														<h3 className="font-medium">
															{prompt.prompt_name}
														</h3>
														<p className="text-sm text-slate-500">
															Server: {prompt.server_name}
														</p>
													</div>
													{prompt.enabled && (
														<Badge variant="default" className="ml-2">
															Enabled
														</Badge>
													)}
												</div>
												<Switch
													checked={prompt.enabled}
													onCheckedChange={(enabled) =>
														promptToggleMutation.mutate({
															promptId: prompt.id,
															enable: enabled,
														})
													}
													disabled={promptToggleMutation.isPending}
												/>
											</div>
										))}
									</div>
								) : (
									<p className="text-center text-slate-500 py-8">
										No prompts found in this configuration suit
									</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			) : (
				<Card>
					<CardContent className="p-6">
						<p className="text-center text-slate-500">
							Configuration suit not found
						</p>
					</CardContent>
				</Card>
			)}

			{/* Edit Suit Drawer */}
			<SuitFormDrawer
				open={isEditDialogOpen}
				onOpenChange={setIsEditDialogOpen}
				mode="edit"
				suit={suit}
				onSuccess={() => {
					setIsEditDialogOpen(false);
					refetchSuit();
				}}
			/>
		</div>
	);
}
