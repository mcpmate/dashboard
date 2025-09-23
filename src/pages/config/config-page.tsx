import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Check,
	Plus,
	RefreshCw,
	Server,
	Settings,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { useToast } from "../../components/ui/use-toast";
import { configSuitsApi, serversApi } from "../../lib/api";
import type {
	ConfigSuit,
	InstanceSummary,
	ServerSummary,
} from "../../lib/types";

export function ConfigPage() {
	const queryClient = useQueryClient();
	const { toast } = useToast();
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
        toast({
            title: "Profile Activated",
            description: "Profile has been successfully activated",
        });
    },
    onError: (error) => {
        toast({
            title: "Activation Failed",
            description: `Failed to activate profile: ${error instanceof Error ? error.message : String(error)}`,
            variant: "destructive",
        });
    },
	});

	// Suit deactivation mutation
	const deactivateSuitMutation = useMutation({
		mutationFn: configSuitsApi.deactivateSuit,
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["configSuits"] });
        toast({
            title: "Profile Deactivated",
            description: "Profile has been successfully deactivated",
        });
    },
    onError: (error) => {
        toast({
            title: "Deactivation Failed",
            description: `Failed to deactivate profile: ${error instanceof Error ? error.message : String(error)}`,
            variant: "destructive",
        });
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
	const activeSuits = suits.filter((suit: ConfigSuit) => suit.is_active);

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
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                                Profiles
                            </CardTitle>
									<Settings className="h-4 w-4 text-emerald-600" />
								</div>
							</CardHeader>
							<CardContent>
								{isLoadingSuits ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
											{activeSuits.length}/{suits.length}
										</div>
										<p className="text-xs text-muted-foreground">
                                active profiles
										</p>
									</>
								)}
							</CardContent>
						</Card>

						{/* Servers Status */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm font-medium">Servers</CardTitle>
									<Server className="h-4 w-4 text-blue-600" />
								</div>
							</CardHeader>
							<CardContent>
								{isLoadingActiveSuitServers || isLoadingSuits ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
											{enabledServersCount}/{totalServersInSuit}
										</div>
										<p className="text-xs text-muted-foreground">running</p>
									</>
								)}
							</CardContent>
						</Card>

						{/* Tools Status */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm font-medium">Tools</CardTitle>
									<Wrench className="h-4 w-4 text-purple-600" />
								</div>
							</CardHeader>
							<CardContent>
								{isLoadingActiveSuitTools || isLoadingSuits ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
											{enabledToolsCount}/{totalToolsInSuit}
										</div>
										<p className="text-xs text-muted-foreground">enabled</p>
									</>
								)}
							</CardContent>
						</Card>

						{/* Instances Status */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm font-medium">
										Instances
									</CardTitle>
									<Activity className="h-4 w-4 text-orange-600" />
								</div>
							</CardHeader>
							<CardContent>
								{isLoadingAllServers ||
								isLoadingActiveSuitServers ||
								isLoadingSuits ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
											{readyInstances}/{totalInstances}
										</div>
										<p className="text-xs text-muted-foreground">ready</p>
									</>
								)}
							</CardContent>
						</Card>
					</div>
				</div>

				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
                                <CardTitle>Profiles</CardTitle>
								<CardDescription>
                                Manage profiles for different scenarios and
									applications
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						{isLoadingSuits ? (
							<div className="space-y-4">
								{["s1", "s2", "s3"].map((id) => (
									<div
										key={`loading-suit-${id}`}
										className="flex items-center justify-between rounded-lg border p-4"
									>
										<div className="space-y-1">
											<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											<div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
										</div>
										<div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
									</div>
								))}
							</div>
						) : suits.length > 0 ? (
				<div className="space-y-4">
					{suits.map((suit: ConfigSuit) => (
						<div
							key={suit.id}
							className="flex items-center justify-between rounded-lg border p-4"
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
								<div className="flex items-center gap-4 text-xs text-slate-400">
									<span>Priority: {suit.priority}</span>
									<span>
										Multi-select: {suit.multi_select ? "Yes" : "No"}
									</span>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Switch
									checked={suit.is_active}
									onCheckedChange={() => handleSuitToggle(suit)}
									disabled={
										activateSuitMutation.isPending ||
										deactivateSuitMutation.isPending
									}
								/>
								<Link to={`/config/suits/${suit.id}`}>
									<Button variant="outline" size="sm">
										<Settings className="mr-2 h-4 w-4" />
										Configure
									</Button>
								</Link>
							</div>
						</div>
					))}
				</div>
						) : (
							<div className="text-center py-8">
								<Settings className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                            <p className="text-slate-500 mb-2">No profiles found</p>
                            <p className="text-sm text-slate-400">Profiles help organize and manage your MCP servers, tools, and resources</p>
							</div>
						)}
					</CardContent>
				</Card>
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
