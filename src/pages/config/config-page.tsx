import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Check,
	Plus,
	RefreshCw,
	Server,
	Settings,
	Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Switch } from "../../components/ui/switch";
import { notifyError, notifySuccess } from "../../lib/notify";
import { configSuitsApi, serversApi } from "../../lib/api";
import type {
	ConfigSuit,
	InstanceSummary,
	ServerSummary,
} from "../../lib/types";

type SuitStats = {
	totalServers: number;
	enabledServers: number;
	totalTools: number;
	enabledTools: number;
	totalResources: number;
	enabledResources: number;
	totalPrompts: number;
	enabledPrompts: number;
};

export function ConfigPage() {
    const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isNewSuitDialogOpen, setIsNewSuitDialogOpen] = useState(false);

	const {
		data: suitsResponse,
		isLoading: isLoadingSuits,
		refetch: refetchSuits,
		isRefetching: isRefetchingSuits,
		error: suitsError,
	} = useQuery({
		queryKey: ["configSuits"],
		queryFn: async () => {
			console.log("Fetching config suits...");
			const result = await configSuitsApi.getAll();
			console.log("Config suits response:", result);
			return result;
		},
		retry: 1,
		refetchInterval: 30000,
	});

	// Get the active suit for detailed statistics
	const activeSuit = suitsResponse?.suits?.find(
		(suit: ConfigSuit) => suit.is_active,
	);

	// Fetch servers data for the active suit
	const {
		data: activeSuitServersResponse,
		isLoading: isLoadingActiveSuitServers,
	} = useQuery({
		queryKey: ["activeSuitServers", activeSuit?.id],
		queryFn: () =>
			activeSuit
				? configSuitsApi.getServers(activeSuit.id)
				: Promise.resolve(null),
		enabled: !!activeSuit,
		retry: 1,
	});

	// Fetch tools data for the active suit
	const { data: activeSuitToolsResponse, isLoading: isLoadingActiveSuitTools } =
		useQuery({
			queryKey: ["activeSuitTools", activeSuit?.id],
			queryFn: () =>
				activeSuit
					? configSuitsApi.getTools(activeSuit.id)
					: Promise.resolve(null),
			enabled: !!activeSuit,
			retry: 1,
		});

	// Fetch all servers data for instance count
	const { data: allServersResponse, isLoading: isLoadingAllServers } = useQuery(
		{
			queryKey: ["allServersStats"],
			queryFn: serversApi.getAll,
			retry: 1,
		},
	);

	// Suit activation mutation
	const activateSuitMutation = useMutation({
		mutationFn: configSuitsApi.activateSuit,
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["configSuits"] });
        notifySuccess("Profile activated", "Profile has been successfully activated");
    },
    onError: (error) => {
        notifyError("Activation failed", `Failed to activate profile: ${error instanceof Error ? error.message : String(error)}`);
    },
	});

	// Suit deactivation mutation
	const deactivateSuitMutation = useMutation({
		mutationFn: configSuitsApi.deactivateSuit,
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["configSuits"] });
        notifySuccess("Profile deactivated", "Profile has been successfully deactivated");
    },
    onError: (error) => {
        notifyError("Deactivation failed", `Failed to deactivate profile: ${error instanceof Error ? error.message : String(error)}`);
    },
	});


	// Handle individual suit toggle
	const handleSuitToggle = (suit: ConfigSuit) => {
		if (suit.is_active) {
			deactivateSuitMutation.mutate(suit.id);
		} else {
			activateSuitMutation.mutate(suit.id);
		}
	};


	const suits = suitsResponse?.suits || [];
	const orderedSuits = useMemo(() => {
		if (!suits.length) {
			return [] as ConfigSuit[];
		}
		const defaults = suits.filter((suit) => suit.is_default);
		const others = suits.filter((suit) => !suit.is_default);
		return [...defaults, ...others];
	}, [suits]);
	const activeSuits = suits.filter((suit: ConfigSuit) => suit.is_active);

	const suitStatQueries = useQueries({
		queries: orderedSuits.map((suit) => ({
			queryKey: ["configSuitStats", suit.id] as const,
			queryFn: async (): Promise<SuitStats> => {
				const [serversRes, toolsRes, resourcesRes, promptsRes] =
					await Promise.allSettled([
						configSuitsApi.getServers(suit.id),
						configSuitsApi.getTools(suit.id),
						configSuitsApi.getResources(suit.id),
						configSuitsApi.getPrompts(suit.id),
					]);

				const servers =
					serversRes.status === "fulfilled"
						? serversRes.value.servers || []
						: [];
				if (serversRes.status === "rejected") {
					console.error("Failed to fetch profile servers stats", serversRes.reason);
				}

				const tools =
					toolsRes.status === "fulfilled"
						? toolsRes.value.tools || []
						: [];
				if (toolsRes.status === "rejected") {
					console.error("Failed to fetch profile tools stats", toolsRes.reason);
				}

				const resources =
					resourcesRes.status === "fulfilled"
						? resourcesRes.value.resources || []
						: [];
				if (resourcesRes.status === "rejected") {
					console.error("Failed to fetch profile resources stats", resourcesRes.reason);
				}

				const prompts =
					promptsRes.status === "fulfilled"
						? promptsRes.value.prompts || []
						: [];
				if (promptsRes.status === "rejected") {
					console.error("Failed to fetch profile prompts stats", promptsRes.reason);
				}

				return {
					totalServers: servers.length,
					enabledServers: servers.filter((server) => server.enabled).length,
					totalTools: tools.length,
					enabledTools: tools.filter((tool) => tool.enabled).length,
					totalResources: resources.length,
					enabledResources: resources.filter((resource) => resource.enabled).length,
					totalPrompts: prompts.length,
					enabledPrompts: prompts.filter((prompt) => prompt.enabled).length,
				};
			},
			enabled: !!suit.id,
			staleTime: 30000,
			}))
	});

	// Calculate statistics based on active suit
	const activeSuitServers = activeSuitServersResponse?.servers || [];
	const activeSuitTools = activeSuitToolsResponse?.tools || [];
	const allServers = allServersResponse?.servers || [];

	// Servers statistics: count enabled servers in active suit
	const enabledServersCount = activeSuitServers.filter(
		(server) => server.enabled,
	).length;
	const totalServersInSuit = activeSuitServers.length;

	// Tools statistics: count enabled tools in active suit
	const enabledToolsCount = activeSuitTools.filter(
		(tool) => tool.enabled,
	).length;
	const totalToolsInSuit = activeSuitTools.length;

	// Instances statistics: count instances from all enabled servers in active suit
	const enabledServerNames = activeSuitServers
		.filter((server) => server.enabled)
		.map((server) => server.name);

	const totalInstances = allServers
		.filter((server) => enabledServerNames.includes(server.name))
		.reduce(
			(sum: number, server: ServerSummary) =>
				sum + (server.instances?.length || 0),
			0,
		);

	const readyInstances = allServers
		.filter((server) => enabledServerNames.includes(server.name))
		.reduce((sum: number, server: ServerSummary) => {
			if (server.instances) {
				return (
					sum +
					server.instances.filter(
						(instance: InstanceSummary) =>
							instance.status &&
							["ready", "busy", "running"].includes(
								instance.status.toLowerCase(),
							),
					).length
				);
			}
			return sum;
		}, 0);

	return (
		<div className="space-y-6">
			{/* Debug Error Display */}
			{suitsError && (
				<div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h3 className="text-red-800 font-medium">Error loading profiles:</h3>
					<p className="text-red-600 text-sm mt-1">{String(suitsError)}</p>
				</div>
			)}

			<div className="flex items-center justify-between">
    <h2 className="text-3xl font-bold tracking-tight">Profiles</h2>
				<div className="flex gap-2">
					<Button
						onClick={() => refetchSuits()}
						disabled={isRefetchingSuits}
						variant="outline"
						size="sm"
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${isRefetchingSuits ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
        <Button size="sm" onClick={() => setIsNewSuitDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Profile
        </Button>
				</div>
			</div>

			<div className="grid gap-6">
				<div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{/* Active Profiles */}
					<Card className="flex flex-col justify-between">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium">Profiles</CardTitle>
								<Settings className="h-4 w-4 text-emerald-600" />
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{isLoadingSuits ? (
								<div className="animate-pulse space-y-1">
									<div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							) : (
								<>
									<div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
										{activeSuits.length}/{suits.length}
									</div>
									<CardDescription className="text-xs text-muted-foreground">
										active profiles
									</CardDescription>
								</>
							)}
						</CardContent>
					</Card>

					{/* Servers Status */}
					<Card className="flex flex-col justify-between">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium">Servers</CardTitle>
								<Server className="h-4 w-4 text-blue-600" />
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{isLoadingActiveSuitServers || isLoadingSuits ? (
								<div className="animate-pulse space-y-1">
									<div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							) : (
								<>
									<div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
										{enabledServersCount}/{totalServersInSuit}
									</div>
									<CardDescription className="text-xs text-muted-foreground">
										running
									</CardDescription>
								</>
							)}
						</CardContent>
					</Card>

					{/* Tools Status */}
					<Card className="flex flex-col justify-between">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium">Tools</CardTitle>
								<Wrench className="h-4 w-4 text-purple-600" />
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{isLoadingActiveSuitTools || isLoadingSuits ? (
								<div className="animate-pulse space-y-1">
									<div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							) : (
								<>
									<div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
										{enabledToolsCount}/{totalToolsInSuit}
									</div>
									<CardDescription className="text-xs text-muted-foreground">
										enabled
									</CardDescription>
								</>
							)}
						</CardContent>
					</Card>

					{/* Instances Status */}
					<Card className="flex flex-col justify-between">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium">Instances</CardTitle>
								<Activity className="h-4 w-4 text-orange-600" />
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{isLoadingAllServers || isLoadingActiveSuitServers || isLoadingSuits ? (
								<div className="animate-pulse space-y-1">
									<div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							) : (
								<>
									<div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
										{readyInstances}/{totalInstances}
									</div>
									<CardDescription className="text-xs text-muted-foreground">
										ready
									</CardDescription>
								</>
							)}
						</CardContent>
					</Card>
					</div>
				</div>

				{isLoadingSuits ? (
							<div className="space-y-4">
								{["s1", "s2", "s3"].map((id) => (
									<div
										key={`loading-suit-${id}`}
										className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
									>
										<div className="space-y-1">
											<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											<div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
										</div>
										<div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
									</div>
								))}
							</div>
						) : orderedSuits.length > 0 ? (
				<div className="space-y-4">
					{orderedSuits.map((suit: ConfigSuit, index) => {
						const statsQuery = suitStatQueries[index];
						const stats = statsQuery?.data;
						const statsLoading = statsQuery?.isFetching || statsQuery?.isLoading;
						const formatCount = (
							enabled?: number,
							total?: number,
						) => {
							if (statsLoading) return "...";
							const safeEnabled = typeof enabled === "number" ? enabled : 0;
							const safeTotal = typeof total === "number" ? total : 0;
							return `${safeEnabled}/${safeTotal}`;
						};

						return (
							<div
								key={suit.id}
								className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 cursor-pointer transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950"
								role="button"
								tabIndex={0}
								onClick={() => navigate(`/profiles/${suit.id}`)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										navigate(`/config/profiles/${suit.id}`);
									}
								}}
							>
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<h3 className="font-medium text-sm">
										{suit.name
											.split(" ")
											.map(
												(word: string) =>
													word.charAt(0).toUpperCase() +
													word.slice(1).toLowerCase(),
											)
											.join(" ")}
									</h3>
									<Badge
										variant={suit.is_active ? "default" : "secondary"}
									>
										{suit.suit_type}
									</Badge>
									{suit.is_active && (
										<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
											<Check className="mr-1 h-3 w-3" />
											Active
										</span>
									)}
									{suit.is_default && (
										<Badge variant="outline">Default</Badge>
									)}
								</div>
								{suit.description && (
									<p className="text-sm text-slate-500">
										{suit.description}
									</p>
								)}
								<div className="flex flex-col gap-1 text-xs text-slate-400">
									<div className="flex flex-wrap items-center gap-4">
										<span>Priority: {suit.priority}</span>
										<span>
											Multi-select: {suit.multi_select ? "Yes" : "No"}
										</span>
									</div>
									<div className="flex flex-wrap items-center gap-4">
										<span>Servers: {formatCount(stats?.enabledServers, stats?.totalServers)}</span>
										<span>Tools: {formatCount(stats?.enabledTools, stats?.totalTools)}</span>
										<span>Resources: {formatCount(stats?.enabledResources, stats?.totalResources)}</span>
										<span>Prompts: {formatCount(stats?.enabledPrompts, stats?.totalPrompts)}</span>
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
                        <Switch
                            checked={suit.is_active}
                            onCheckedChange={() => handleSuitToggle(suit)}
                            disabled={
                                suit.is_default ||
                                activateSuitMutation.isPending ||
                                deactivateSuitMutation.isPending
                            }
                            onClick={(e) => e.stopPropagation()}
                        />
                        <Link to={`/profiles/${suit.id}`} onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" size="sm">
                                <Settings className="mr-2 h-4 w-4" />
                                Configure
                            </Button>
                        </Link>
							</div>
                    </div>
						);
					})}
				</div>
						) : (
							<div className="text-center py-8">
								<Settings className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                            <p className="text-slate-500 mb-2">No profiles found</p>
                            <p className="text-sm text-slate-400">Profiles help organize and manage your MCP servers, tools, and resources</p>
							</div>
						)}
			</div>

			{/* New Suit Drawer */}
			<SuitFormDrawer
				open={isNewSuitDialogOpen}
				onOpenChange={setIsNewSuitDialogOpen}
				mode="create"
				onSuccess={() => {
					setIsNewSuitDialogOpen(false);
					refetchSuits();
				}}
			/>
		</div>
	);
}
