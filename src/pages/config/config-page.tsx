import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Check,
	Play,
	Plus,
	RefreshCw,
	Server,
	Settings,
	Square,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { configSuitsApi, serversApi, toolsApi } from "../../lib/api";
import type {
	ConfigSuit,
	InstanceSummary,
	ServerSummary,
	Tool,
} from "../../lib/types";

export function ConfigPage() {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const [selectedSuits, setSelectedSuits] = useState<string[]>([]);

	// Fetch servers data for statistics
	const { data: serversResponse, isLoading: isLoadingServers } = useQuery({
		queryKey: ["serversStats"],
		queryFn: serversApi.getAll,
		retry: 1,
	});

	// Fetch tools data for statistics
	const { data: toolsResponse, isLoading: isLoadingTools } = useQuery({
		queryKey: ["toolsStats"],
		queryFn: toolsApi.getAll,
		retry: 1,
	});

	const {
		data: suitsResponse,
		isLoading: isLoadingSuits,
		refetch: refetchSuits,
		isRefetching: isRefetchingSuits,
	} = useQuery({
		queryKey: ["configSuits"],
		queryFn: configSuitsApi.getAll,
		retry: 1,
		refetchInterval: 30000,
	});

	// Suit activation mutation
	const activateSuitMutation = useMutation({
		mutationFn: configSuitsApi.activateSuit,
		onSuccess: () => {
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

	// Suit deactivation mutation
	const deactivateSuitMutation = useMutation({
		mutationFn: configSuitsApi.deactivateSuit,
		onSuccess: () => {
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

	// Batch operations
	const batchActivateMutation = useMutation({
		mutationFn: configSuitsApi.batchActivate,
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			toast({
				title: "Batch Activation Complete",
				description: `Successfully activated ${response.success_count} config suits`,
			});
			setSelectedSuits([]);
		},
		onError: (error) => {
			toast({
				title: "Batch Activation Failed",
				description: `Failed to activate config suits: ${error instanceof Error ? error.message : String(error)}`,
				variant: "destructive",
			});
		},
	});

	const batchDeactivateMutation = useMutation({
		mutationFn: configSuitsApi.batchDeactivate,
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			toast({
				title: "Batch Deactivation Complete",
				description: `Successfully deactivated ${response.success_count} config suits`,
			});
			setSelectedSuits([]);
		},
		onError: (error) => {
			toast({
				title: "Batch Deactivation Failed",
				description: `Failed to deactivate config suits: ${error instanceof Error ? error.message : String(error)}`,
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

	// Handle suit selection for batch operations
	const handleSuitSelection = (suitId: string, selected: boolean) => {
		if (selected) {
			setSelectedSuits((prev) => [...prev, suitId]);
		} else {
			setSelectedSuits((prev) => prev.filter((id) => id !== suitId));
		}
	};

	// Handle select all / deselect all
	const handleSelectAll = () => {
		if (selectedSuits.length === suitsResponse?.suits.length) {
			setSelectedSuits([]);
		} else {
			setSelectedSuits(
				suitsResponse?.suits.map((suit: ConfigSuit) => suit.id) || [],
			);
		}
	};

	const suits = suitsResponse?.suits || [];
	const activeSuits = suits.filter((suit: ConfigSuit) => suit.is_active);

	// Calculate statistics
	const servers = serversResponse?.servers || [];
	const tools = toolsResponse?.tools || [];
	const enabledServers = servers.filter(
		(server: ServerSummary) =>
			server.status &&
			["connected", "running", "ready", "healthy"].includes(
				server.status.toLowerCase(),
			),
	);
	const enabledTools = tools.filter((tool: Tool) => tool.is_enabled);
	const totalInstances = servers.reduce(
		(sum: number, server: ServerSummary) => sum + (server.instance_count || 0),
		0,
	);
	const readyInstances = servers.reduce(
		(sum: number, server: ServerSummary) => {
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
		},
		0,
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold tracking-tight">Config Suits</h2>
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
					<Link to="/config/suits/new">
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							New Suit
						</Button>
					</Link>
				</div>
			</div>

			<div className="grid gap-6">
				<div>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						{/* Active Config Suits */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm font-medium">
										Config Suits
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
											active suits
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
								{isLoadingServers ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
											{enabledServers.length}/{servers.length}
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
								{isLoadingTools ? (
									<div className="animate-pulse">
										<div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1"></div>
										<div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
									</div>
								) : (
									<>
										<div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
											{enabledTools.length}/{tools.length}
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
								{isLoadingServers ? (
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
								<CardTitle>Configuration Suits</CardTitle>
								<CardDescription>
									Manage configuration suits for different scenarios and
									applications
								</CardDescription>
							</div>
							<div className="flex gap-2">
								{selectedSuits.length > 0 && (
									<>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												batchActivateMutation.mutate(selectedSuits)
											}
											disabled={batchActivateMutation.isPending}
										>
											<Play className="mr-2 h-4 w-4" />
											Activate Selected
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												batchDeactivateMutation.mutate(selectedSuits)
											}
											disabled={batchDeactivateMutation.isPending}
										>
											<Square className="mr-2 h-4 w-4" />
											Deactivate Selected
										</Button>
									</>
								)}
							</div>
						</div>
					</CardHeader>
					<CardContent>
						{isLoadingSuits ? (
							<div className="space-y-4">
								{Array.from({ length: 3 }).map((_, i) => (
									<div
										key={`loading-suit-${i}`}
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
							<div className="space-y-6">
								{/* Batch controls */}
								<div className="flex items-center justify-between border-b pb-4">
									<div className="flex items-center gap-2">
										<input
											type="checkbox"
											checked={
												selectedSuits.length === suits.length &&
												suits.length > 0
											}
											onChange={handleSelectAll}
											className="rounded"
										/>
										<span className="text-sm text-slate-600">
											{selectedSuits.length > 0
												? `${selectedSuits.length} selected`
												: "Select all"}
										</span>
									</div>
									{selectedSuits.length > 0 && (
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setSelectedSuits([])}
										>
											Clear selection
										</Button>
									)}
								</div>

								{/* Suits list */}
								<div className="space-y-4">
									{suits.map((suit: ConfigSuit) => (
										<div
											key={suit.id}
											className="flex items-center justify-between rounded-lg border p-4"
										>
											<div className="flex items-center gap-3">
												<input
													type="checkbox"
													checked={selectedSuits.includes(suit.id)}
													onChange={(e) =>
														handleSuitSelection(suit.id, e.target.checked)
													}
													className="rounded"
												/>
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
							</div>
						) : (
							<div className="text-center py-8">
								<Settings className="mx-auto h-12 w-12 text-slate-400 mb-4" />
								<p className="text-slate-500 mb-2">
									No configuration suits found
								</p>
								<p className="text-sm text-slate-400">
									Configuration suits help organize and manage your MCP servers,
									tools, and resources
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
