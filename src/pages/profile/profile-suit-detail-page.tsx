import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BadgeCheck,
	Bug,
	Check,
	Edit3,
	Play,
	RefreshCw,
	Server,
	Square,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CapabilityList from "../../components/capability-list";
import { SuitFormDrawer } from "../../components/suit-form-drawer";
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
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
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
import { configSuitsApi, serversApi } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";
import { useAppStore } from "../../lib/store";
import type {
	ConfigSuitPrompt,
	ConfigSuitResource,
	ConfigSuitServer,
	ConfigSuitTool,
} from "../../lib/types";

const toTitleCase = (value?: string | null) =>
	(value ?? "")
		.trim()
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ") ||
	value ||
	"";

export function ProfileSuitDetailPage() {
	const { suitId } = useParams<{ suitId: string }>();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState("overview");

	// Developer toggles
	const enableServerDebug = useAppStore(
		(state) => state.dashboardSettings.enableServerDebug,
	);
	const openDebugInNewWindow = useAppStore(
		(state) => state.dashboardSettings.openDebugInNewWindow,
	);

	const openDebug = (
		targetServerId: string,
		channel: "proxy" | "native" = "proxy",
	) => {
		const url = `/servers/${encodeURIComponent(targetServerId)}?view=debug&channel=${channel}`;
		if (openDebugInNewWindow) {
			if (typeof window !== "undefined") {
				window.open(url, "_blank", "noopener,noreferrer");
			}
			return;
		}
		navigate(url);
	};
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
	// Bulk selection states for lists
	const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
	const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
	const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
	const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([]);

	// Bulk mutations using server-side batch manage to improve reliability
	const bulkToolsM = useMutation({
		mutationFn: ({ enable }: { enable: boolean }) =>
			configSuitsApi.bulkTools(
				suitId!,
				selectedToolIds,
				enable ? "enable" : "disable",
			),
		onSuccess: () => {
			setSelectedToolIds([]);
			refetchTools();
			notifySuccess("Tools updated", "Bulk operation completed");
		},
		onError: (e) => notifyError("Tools update failed", String(e)),
	});
	const bulkResourcesM = useMutation({
		mutationFn: ({ enable }: { enable: boolean }) =>
			configSuitsApi.bulkResources(
				suitId!,
				selectedResourceIds,
				enable ? "enable" : "disable",
			),
		onSuccess: () => {
			setSelectedResourceIds([]);
			refetchResources();
			notifySuccess("Resources updated", "Bulk operation completed");
		},
		onError: (e) => notifyError("Resources update failed", String(e)),
	});
	const bulkPromptsM = useMutation({
		mutationFn: ({ enable }: { enable: boolean }) =>
			configSuitsApi.bulkPrompts(
				suitId!,
				selectedPromptIds,
				enable ? "enable" : "disable",
			),
		onSuccess: () => {
			setSelectedPromptIds([]);
			refetchPrompts();
			notifySuccess("Prompts updated", "Bulk operation completed");
		},
		onError: (e) => notifyError("Prompts update failed", String(e)),
	});

	const bulkServersM = useMutation({
		mutationFn: ({ enable }: { enable: boolean }) =>
			configSuitsApi.bulkServers(
				suitId!,
				selectedServerIds,
				enable ? "enable" : "disable",
			),
		onSuccess: () => {
			setSelectedServerIds([]);
			refetchServers();
			notifySuccess("Servers updated", "Bulk operation completed");
		},
		onError: (e) => notifyError("Servers update failed", String(e)),
	});

	// Force cleanup when drawer closes to prevent overlay issues
	useEffect(() => {
		if (!isEditDialogOpen) {
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
	}, [isEditDialogOpen]);

	// Do not early-return before hooks; guard queries with `enabled`

	// Fetch config suit details
	const {
		data: suit,
		isLoading: isLoadingSuit,
		refetch: refetchSuit,
		isRefetching: isRefetchingSuit,
	} = useQuery({
		queryKey: ["configSuit", suitId],
		queryFn: async () => {
			if (!suitId) return undefined;
			console.log("Fetching profile details for:", suitId);
			const result = await configSuitsApi.getSuit(suitId);
			console.log("Profile details response:", result);
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
	} = useQuery({
		queryKey: ["configSuitServers", suitId],
		queryFn: async () => {
			if (!suitId) return undefined;
			console.log("Fetching servers for profile:", suitId);
			const result = await configSuitsApi.getServers(suitId);
			console.log("Profile servers response:", result);
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
			notifySuccess(
				"Profile activated",
				"Profile has been successfully activated",
			);
		},
		onError: (error) => {
			notifyError(
				"Activation failed",
				`Failed to activate profile: ${error instanceof Error ? error.message : String(error)}`,
			);
		},
	});

const deactivateSuitMutation = useMutation({
	mutationFn: () => configSuitsApi.deactivateSuit(suitId!),
	onSuccess: () => {
		queryClient.invalidateQueries({ queryKey: ["configSuit", suitId] });
		queryClient.invalidateQueries({ queryKey: ["configSuits"] });
		notifySuccess(
			"Profile deactivated",
			"Profile has been successfully deactivated",
		);
	},
	onError: (error) => {
		notifyError(
			"Deactivation failed",
			`Failed to deactivate profile: ${error instanceof Error ? error.message : String(error)}`,
		);
	},
});

	const toggleDefaultMutation = useMutation({
		mutationFn: (nextDefault: boolean) =>
			configSuitsApi.updateSuit(suitId!, { is_default: nextDefault }),
		onSuccess: (_response, nextDefault) => {
			queryClient.invalidateQueries({ queryKey: ["configSuit", suitId] });
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			notifySuccess(
				"Default bundle updated",
				nextDefault
					? "Profile is now part of the default bundle"
					: "Profile removed from the default bundle",
			);
		},
		onError: (error, nextDefault) => {
			notifyError(
				"Default update failed",
				`Failed to ${nextDefault ? "set" : "remove"} default: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		},
	});

	// Delete profile mutation
	const deleteSuitMutation = useMutation({
		mutationFn: () => {
			if (!suitId) return Promise.reject("No suit ID");
			return configSuitsApi.deleteSuit(suitId);
		},
		onSuccess: () => {
			// Invalidate queries to refresh the profiles list
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			notifySuccess("Profile deleted", "Profile has been successfully deleted");
			navigate("/profiles");
		},
		onError: (error) => {
			notifyError(
				"Delete failed",
				`Failed to delete profile: ${error instanceof Error ? error.message : String(error)}`,
			);
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
			// Refetch all capability data to update counts in tabs
			refetchServers();
			refetchTools();
			refetchResources();
			refetchPrompts();

			// Invalidate profile statistics cache for config page
			queryClient.invalidateQueries({ queryKey: ["configSuitStats", suitId] });

			notifySuccess("Server updated", "Server status has been updated");
		},
		onError: (error) => {
			notifyError(
				"Server update failed",
				`Failed to update server: ${error instanceof Error ? error.message : String(error)}`,
			);
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
			notifySuccess("Tool updated", "Tool status has been updated");
		},
		onError: (error) => {
			notifyError(
				"Tool update failed",
				`Failed to update tool: ${error instanceof Error ? error.message : String(error)}`,
			);
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
			notifySuccess("Resource updated", "Resource status has been updated");
		},
		onError: (error) => {
			notifyError(
				"Resource update failed",
				`Failed to update resource: ${error instanceof Error ? error.message : String(error)}`,
			);
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
			notifySuccess("Prompt updated", "Prompt status has been updated");
		},
	onError: (error) => {
		notifyError(
			"Prompt update failed",
			`Failed to update prompt: ${error instanceof Error ? error.message : String(error)}`,
		);
	},
});

const suitRole = suit?.role ?? "user";
const isDefaultAnchor = suitRole === "default_anchor";
	const defaultButtonDisabled =
		!suit || isDefaultAnchor || toggleDefaultMutation.isPending;
	const defaultButtonLabel = !suit
		? "Default"
		: isDefaultAnchor
			? "Default Anchor"
			: suit.is_default
				? "Leave Default"
				: "Join Default";
	const defaultButtonIcon = suit?.is_default ? (
		<BadgeCheck
			className={`h-4 w-4 ${
				toggleDefaultMutation.isPending ? "animate-spin" : ""
			}`}
		/>
) : (
		<Square className="h-4 w-4" />
);

	const handleSuitToggle = () => {
		if (isDefaultAnchor) {
			return;
		}
		if (suit?.is_active) {
			deactivateSuitMutation.mutate();
		} else {
			activateSuitMutation.mutate();
		}
	};

	const handleDefaultToggle = () => {
		if (!suit || isDefaultAnchor || toggleDefaultMutation.isPending) {
			return;
		}
		const nextDefault = !suit.is_default;
		toggleDefaultMutation.mutate(nextDefault);
	};

	const handleRefreshAll = () => {
		refetchSuit();
		refetchServers();
		refetchTools();
		refetchResources();
		refetchPrompts();
	};

	const handleEditDrawerClose = (open: boolean) => {
		setIsEditDialogOpen(open);
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

	// Global servers for availability(connected) calculation
	const { data: globalServersResp } = useQuery({
		queryKey: ["all-servers-for-profile-overview"],
		queryFn: serversApi.getAll,
		staleTime: 30_000,
	});
	const globalServers = globalServersResp?.servers ?? [];
	// For profile counts, available = total in this profile (not global state)
	const availableServersInProfile = servers;

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
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					{suit && (
						<div className="flex items-center gap-3">
							<div className="flex flex-col">
								<div className="flex items-center gap-3">
									<h2 className="text-3xl font-bold tracking-tight">
										{toTitleCase(suit.name)}
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
													{suitRole === "default_anchor" ? (
														<Badge variant="outline">Default Anchor</Badge>
													) : suit.is_default ? (
														<Badge variant="outline">In Default</Badge>
													) : null}
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
				{/* page-level actions moved into Overview card */}
			</div>

			{!suitId ? (
				<Card>
					<CardContent className="p-4">
						<p className="text-center text-slate-500">
							Profile ID not provided
						</p>
					</CardContent>
				</Card>
			) : isLoadingSuit ? (
				<Card>
					<CardContent className="p-4">
						<div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
					</CardContent>
				</Card>
			) : suit ? (
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="space-y-4"
				>
					<div className="flex items-center justify-between">
						<TabsList className="flex items-center gap-2">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="servers">
								Servers ({enabledServers.length}/{servers.length})
							</TabsTrigger>
							<TabsTrigger value="tools">
								Tools ({enabledTools.length}/{tools.length})
							</TabsTrigger>
							<TabsTrigger value="resources">
								Resources ({enabledResources.length}/{resources.length})
							</TabsTrigger>
							<TabsTrigger value="prompts">
								Prompts ({enabledPrompts.length}/{prompts.length})
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="overview">
						<div className="grid gap-4">
							<Card>
								<CardContent className="p-4">
									<div className="flex flex-col gap-4">
										<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
											<div className="flex flex-wrap items-start gap-4">
												<Avatar className="text-sm">
													<AvatarFallback>
														{suit.name.slice(0, 1).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
													<span className="text-xs uppercase text-slate-500">
														Status
													</span>
													<Badge
														variant="secondary"
														className={`justify-self-start border px-2.5 py-0.5 leading-none min-h-[1.5rem] ${
															suit.is_active
																? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-200"
																: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
														}`}
													>
														{suit.is_active ? "Active" : "Inactive"}
													</Badge>

													<span className="text-xs uppercase text-slate-500">
														Type
													</span>
													<span className="font-mono text-sm leading-tight">
														{suit.suit_type}
													</span>

													<span className="text-xs uppercase text-slate-500">
														Multi-select
													</span>
													<span className="text-sm leading-tight">
														{suit.multi_select ? "Yes" : "No"}
													</span>

													<span className="text-xs uppercase text-slate-500">
														Priority
													</span>
													<span className="font-mono text-sm leading-tight">
														{suit.priority}
													</span>
												</div>
											</div>
											<div className="flex flex-wrap items-start justify-end gap-2 self-start">
												<Button
													variant="outline"
													size="sm"
													onClick={handleRefreshAll}
													disabled={isRefetchingSuit}
													className="gap-2"
												>
													<RefreshCw
														className={`h-4 w-4 ${isRefetchingSuit ? "animate-spin" : ""}`}
													/>
													Refresh
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setIsEditDialogOpen(true)}
													className="gap-2"
												>
													<Edit3 className="h-4 w-4" />
													Edit
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={handleDefaultToggle}
													disabled={defaultButtonDisabled}
													className="gap-2"
													aria-pressed={suit?.is_default ?? false}
												>
													{defaultButtonIcon}
													{defaultButtonLabel}
												</Button>
											{suitRole === "user" && (
											<Button
												variant="outline"
												size="sm"
												onClick={handleSuitToggle}
												disabled={
													isDefaultAnchor ||
													activateSuitMutation.isPending ||
													deactivateSuitMutation.isPending
												}
												className="gap-2"
											>
												{suit?.is_active ? (
													<Square className="h-4 w-4" />
												) : (
													<Play className="h-4 w-4" />
												)}
												{suit?.is_active ? "Disable" : "Enable"}
											</Button>
											)}
												<Button
													variant="destructive"
													size="sm"
													onClick={() => setIsDeleteDialogOpen(true)}
													disabled={!!suit?.is_default}
													className="gap-2"
												>
													<Trash2 className="h-4 w-4" />
													Delete
												</Button>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>

							<div className="grid gap-4 md:grid-cols-4">
								<Card>
									<CardHeader
										className="pb-2 cursor-pointer"
										onClick={() => setActiveTab("servers")}
									>
										<CardTitle className="text-sm">Servers</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledServers.length}/{availableServersInProfile.length}
										</div>
										<p className="text-xs text-muted-foreground">
											enabled / available
										</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader
										className="pb-2 cursor-pointer"
										onClick={() => setActiveTab("tools")}
									>
										<CardTitle className="text-sm">Tools</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledTools.length}/{tools.length}
										</div>
										<p className="text-xs text-muted-foreground">
											enabled / available
										</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader
										className="pb-2 cursor-pointer"
										onClick={() => setActiveTab("resources")}
									>
										<CardTitle className="text-sm">Resources</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledResources.length}/{resources.length}
										</div>
										<p className="text-xs text-muted-foreground">
											enabled / available
										</p>
									</CardContent>
								</Card>
								<Card>
									<CardHeader
										className="pb-2 cursor-pointer"
										onClick={() => setActiveTab("prompts")}
									>
										<CardTitle className="text-sm">Prompts</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{enabledPrompts.length}/{prompts.length}
										</div>
										<p className="text-xs text-muted-foreground">
											enabled / available
										</p>
									</CardContent>
								</Card>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="servers">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<div>
										<CardTitle>Servers</CardTitle>
										<CardDescription>
											Manage servers included in this profile
										</CardDescription>
									</div>
									{!isLoadingServers && (
										<div className="flex flex-wrap items-center gap-2">
											<Input
												placeholder="Search by name..."
												value={serverQuery}
												onChange={(e) => setServerQuery(e.target.value)}
												className="w-48"
											/>
											<Select
												value={serverStatus}
												onValueChange={(v) =>
													setServerStatus(v as "all" | "enabled" | "disabled")
												}
											>
												<SelectTrigger className="w-36">
													<SelectValue placeholder="Status" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All</SelectItem>
													<SelectItem value="enabled">Enabled</SelectItem>
													<SelectItem value="disabled">Disabled</SelectItem>
												</SelectContent>
											</Select>
											<div className="hidden md:flex items-center gap-1 ml-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setSelectedServerIds(
															visibleServers.map((s: any) => s.id),
														)
													}
												>
													Select all
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSelectedServerIds([])}
												>
													Clear
												</Button>
												<Button
													size="sm"
													disabled={
														bulkServersM.isPending ||
														selectedServerIds.length === 0
													}
													onClick={() => bulkServersM.mutate({ enable: true })}
												>
													Enable
												</Button>
												<Button
													size="sm"
													variant="secondary"
													disabled={
														bulkServersM.isPending ||
														selectedServerIds.length === 0
													}
													onClick={() => bulkServersM.mutate({ enable: false })}
												>
													Disable
												</Button>
											</div>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
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
										{visibleServers.map((server) => {
											const global = (globalServers as any[]).find(
												(gs: any) => gs.name === server.name,
											);
											const globallyEnabled: boolean | undefined =
												global?.enabled;
											return (
												<div
													key={server.id}
													className={`flex items-center justify-between rounded-lg border p-4 ${selectedServerIds.includes(server.id) ? "bg-accent/50 ring-1 ring-primary/40" : ""}`}
													role="button"
													tabIndex={0}
													onClick={() =>
														setSelectedServerIds((prev) =>
															prev.includes(server.id)
																? prev.filter((x) => x !== server.id)
																: [...prev, server.id],
														)
													}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															setSelectedServerIds((prev) =>
																prev.includes(server.id)
																	? prev.filter((x) => x !== server.id)
																	: [...prev, server.id],
															);
														}
													}}
												>
													<div className="flex flex-1 items-center gap-3">
														<Server className="h-5 w-5 text-slate-500" />
														<div>
															<h3 className="font-medium">{server.name}</h3>
															<p className="text-sm text-slate-500">
																ID: {server.id}
															</p>
														</div>
													</div>
													<div className="flex items-center gap-2">
														<div className="flex items-center gap-1 text-xs text-slate-600">
															{server.enabled ? (
																<Badge>Enabled</Badge>
															) : (
																<Badge variant="outline">Disabled</Badge>
															)}
															{globallyEnabled !== undefined &&
																(globallyEnabled ? (
																	<Badge>Global Enabled</Badge>
																) : (
																	<Badge variant="outline">
																		Global Disabled
																	</Badge>
																))}
														</div>
														<Switch
															checked={server.enabled}
															onClick={(e) => e.stopPropagation()}
															onCheckedChange={(enabled) =>
																serverToggleMutation.mutate({
																	serverId: server.id,
																	enable: enabled,
																})
															}
															disabled={serverToggleMutation.isPending}
														/>
														{enableServerDebug && (
															<Button
																size="sm"
																variant="outline"
																className="gap-1"
																onClick={(ev) => {
																	ev.stopPropagation();
																	openDebug(
																		server.id,
																		server.enabled ? "proxy" : "native",
																	);
																}}
															>
																<Bug className="h-4 w-4" />
															</Button>
														)}
													</div>
												</div>
											);
										})}
									</div>
								) : (
									<p className="text-center text-slate-500 py-8">
										No servers found in this profile
									</p>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="tools">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<div>
										<CardTitle>Tools</CardTitle>
										<CardDescription>
											Manage tools included in this profile
										</CardDescription>
									</div>
									{!isLoadingTools && (
										<div className="flex flex-wrap items-center gap-2">
											<Input
												placeholder="Search tool or unique name..."
												value={toolQuery}
												onChange={(e) => setToolQuery(e.target.value)}
												className="w-48"
											/>
											<Select
												value={toolStatus}
												onValueChange={(v) =>
													setToolStatus(v as "all" | "enabled" | "disabled")
												}
											>
												<SelectTrigger className="w-36">
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
												<SelectTrigger className="w-40">
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
											<div className="hidden md:flex items-center gap-1 ml-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setSelectedToolIds(
															visibleTools.map((t: any) => t.id),
														)
													}
												>
													Select all
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSelectedToolIds([])}
												>
													Clear
												</Button>
												<Button
													size="sm"
													disabled={
														bulkToolsM.isPending || selectedToolIds.length === 0
													}
													onClick={() => bulkToolsM.mutate({ enable: true })}
												>
													Enable
												</Button>
												<Button
													size="sm"
													variant="secondary"
													disabled={
														bulkToolsM.isPending || selectedToolIds.length === 0
													}
													onClick={() => bulkToolsM.mutate({ enable: false })}
												>
													Disable
												</Button>
											</div>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
								<CapabilityList
									asCard={false}
									title="Tools"
									kind="tools"
									context="profile"
									items={visibleTools as any}
									loading={isLoadingTools}
									enableToggle
									getId={(t: any) => t.id}
									getEnabled={(t: any) => !!t.enabled}
									onToggle={(id, next) =>
										toolToggleMutation.mutate({ toolId: id, enable: next })
									}
									emptyText="No tools found in this profile"
									filterText={toolQuery}
									selectable
									selectedIds={selectedToolIds}
									onSelectToggle={(id) => {
										setSelectedToolIds((prev) =>
											prev.includes(id)
												? prev.filter((x) => x !== id)
												: [...prev, id],
										);
									}}
									renderAction={
										enableServerDebug
											? (mapped, tool: ConfigSuitTool) => (
													<Button
														size="sm"
														variant="outline"
														className="gap-1"
														onClick={(e) => {
															e.stopPropagation();
															openDebug(
																tool.server_id,
																tool.enabled ? "proxy" : "native",
															);
														}}
													>
														<Bug className="h-3.5 w-3.5" />
													</Button>
												)
											: undefined
									}
								/>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="resources">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<div>
										<CardTitle>Resources</CardTitle>
										<CardDescription>
											Manage resources included in this profile
										</CardDescription>
									</div>
									{!isLoadingResources && (
										<div className="flex flex-wrap items-center gap-2">
											<Input
												placeholder="Search by URI..."
												value={resourceQuery}
												onChange={(e) => setResourceQuery(e.target.value)}
												className="w-48"
											/>
											<Select
												value={resourceStatus}
												onValueChange={(v) =>
													setResourceStatus(v as "all" | "enabled" | "disabled")
												}
											>
												<SelectTrigger className="w-36">
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
												<SelectTrigger className="w-40">
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
											<div className="hidden md:flex items-center gap-1 ml-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setSelectedResourceIds(
															visibleResources.map((r: any) => r.id),
														)
													}
												>
													Select all
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSelectedResourceIds([])}
												>
													Clear
												</Button>
												<Button
													size="sm"
													disabled={
														bulkResourcesM.isPending ||
														selectedResourceIds.length === 0
													}
													onClick={() =>
														bulkResourcesM.mutate({ enable: true })
													}
												>
													Enable
												</Button>
												<Button
													size="sm"
													variant="secondary"
													disabled={
														bulkResourcesM.isPending ||
														selectedResourceIds.length === 0
													}
													onClick={() =>
														bulkResourcesM.mutate({ enable: false })
													}
												>
													Disable
												</Button>
											</div>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
								<CapabilityList
									asCard={false}
									title="Resources"
									kind="resources"
									context="profile"
									items={visibleResources as any}
									loading={isLoadingResources}
									enableToggle
									getId={(r: any) => r.id}
									getEnabled={(r: any) => !!r.enabled}
									onToggle={(id, next) =>
										resourceToggleMutation.mutate({
											resourceId: id,
											enable: next,
										})
									}
									emptyText="No resources found in this profile"
									filterText={resourceQuery}
									selectable
									selectedIds={selectedResourceIds}
									onSelectToggle={(id) => {
										setSelectedResourceIds((prev) =>
											prev.includes(id)
												? prev.filter((x) => x !== id)
												: [...prev, id],
										);
									}}
									renderAction={
										enableServerDebug
											? (mapped, resource: ConfigSuitResource) => (
													<Button
														size="sm"
														variant="outline"
														className="gap-1"
														onClick={(e) => {
															e.stopPropagation();
															openDebug(
																resource.server_id,
																resource.enabled ? "proxy" : "native",
															);
														}}
													>
														<Bug className="h-3.5 w-3.5" />
													</Button>
												)
											: undefined
									}
								/>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="prompts">
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<div>
										<CardTitle>Prompts</CardTitle>
										<CardDescription>
											Manage prompts included in this profile
										</CardDescription>
									</div>
									{!isLoadingPrompts && (
										<div className="flex flex-wrap items-center gap-2">
											<Input
												placeholder="Search by prompt name..."
												value={promptQuery}
												onChange={(e) => setPromptQuery(e.target.value)}
												className="w-48"
											/>
											<Select
												value={promptStatus}
												onValueChange={(v) =>
													setPromptStatus(v as "all" | "enabled" | "disabled")
												}
											>
												<SelectTrigger className="w-36">
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
												<SelectTrigger className="w-40">
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
											<div className="hidden md:flex items-center gap-1 ml-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setSelectedPromptIds(
															visiblePrompts.map((p: any) => p.id),
														)
													}
												>
													Select all
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSelectedPromptIds([])}
												>
													Clear
												</Button>
												<Button
													size="sm"
													disabled={
														bulkPromptsM.isPending ||
														selectedPromptIds.length === 0
													}
													onClick={() => bulkPromptsM.mutate({ enable: true })}
												>
													Enable
												</Button>
												<Button
													size="sm"
													variant="secondary"
													disabled={
														bulkPromptsM.isPending ||
														selectedPromptIds.length === 0
													}
													onClick={() => bulkPromptsM.mutate({ enable: false })}
												>
													Disable
												</Button>
											</div>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
								<CapabilityList
									asCard={false}
									title="Prompts"
									kind="prompts"
									context="profile"
									items={visiblePrompts as any}
									loading={isLoadingPrompts}
									enableToggle
									getId={(p: any) => p.id}
									getEnabled={(p: any) => !!p.enabled}
									onToggle={(id, next) =>
										promptToggleMutation.mutate({ promptId: id, enable: next })
									}
									emptyText="No prompts found in this profile"
									filterText={promptQuery}
									selectable
									selectedIds={selectedPromptIds}
									onSelectToggle={(id) => {
										setSelectedPromptIds((prev) =>
											prev.includes(id)
												? prev.filter((x) => x !== id)
												: [...prev, id],
										);
									}}
									renderAction={
										enableServerDebug
											? (mapped, prompt: ConfigSuitPrompt) => (
													<Button
														size="sm"
														variant="outline"
														className="gap-1"
														onClick={(e) => {
															e.stopPropagation();
															openDebug(
																prompt.server_id,
																prompt.enabled ? "proxy" : "native",
															);
														}}
													>
														<Bug className="h-3.5 w-3.5" />
													</Button>
												)
											: undefined
									}
								/>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			) : (
				<Card>
					<CardContent className="p-4">
						<p className="text-center text-slate-500">Profile not found</p>
					</CardContent>
				</Card>
			)}

			{/* Edit Suit Drawer */}
			<SuitFormDrawer
				open={isEditDialogOpen}
				onOpenChange={handleEditDrawerClose}
				mode="edit"
				suit={suit}
				onSuccess={() => {
					handleEditDrawerClose(false);
					refetchSuit();
				}}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Configuration Suit</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{suit?.name}"? This action cannot
							be undone. All associated configurations will be permanently
							removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								deleteSuitMutation.mutate();
								setIsDeleteDialogOpen(false);
							}}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteSuitMutation.isPending}
						>
							{deleteSuitMutation.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
