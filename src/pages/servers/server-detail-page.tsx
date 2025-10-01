import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { configSuitsApi, inspectorApi, serversApi } from "../../lib/api";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
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
import { notifyError, notifySuccess } from "../../lib/notify";
import { StatusBadge } from "../../components/status-badge";
import { ServerFormDrawer } from "../../components/server-form-drawer";
import {
	AlertTriangle,
	Bug,
	Edit3,
	Eye,
	Loader2,
	Play,
	Power,
	PowerOff,
	RefreshCw,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import CapabilityList from "../../components/capability-list";
import InspectorDrawer, {
	InspectorLogEntry,
} from "../../components/inspector-drawer";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { useAppStore } from "../../lib/store";

const VIEW_MODES = {
	browse: "browse" as const,
	debug: "debug" as const,
};

type InspectorChannel = "proxy" | "native";
type DebugKind = "tools" | "resources" | "prompts";

type InspectorTarget = {
	kind: "tool" | "resource" | "prompt";
	item: any;
};

function getInitialInspectorChannel(): InspectorChannel {
	try {
		if (typeof window !== "undefined") {
			const saved = window.localStorage.getItem("mcp_inspector_channel");
			if (saved === "proxy" || saved === "native") {
				return saved;
			}
		}
	} catch {
		/* noop */
	}
	return "native";
}

interface DebugState {
	items: any[];
	loading: boolean;
	error: string | null;
	fetched: boolean;
	lastFetched?: number;
}

const createDebugState = (): DebugState => ({
	items: [],
	loading: false,
	error: null,
	fetched: false,
});

function makeLogId() {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function ServerDetailPage() {
	const { serverId } = useParams<{ serverId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const viewMode = useAppStore((state) => state.inspectorViewMode);
	const setViewMode = useAppStore((state) => state.setInspectorViewMode);
	const enableServerDebug = useAppStore(
		(state) => state.dashboardSettings.enableServerDebug,
	);

	const initialChannel = useMemo(() => getInitialInspectorChannel(), []);
	const [requestedChannel, setRequestedChannel] =
		useState<InspectorChannel>(initialChannel);
	const [channel, setChannel] = useState<InspectorChannel>(initialChannel);
	const ignoreLocationChange = useRef(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [inspector, setInspector] = useState<InspectorTarget | null>(null);
	const [logs, setLogs] = useState<InspectorLogEntry[]>([]);
	const [debugData, setDebugData] = useState<Record<DebugKind, DebugState>>({
		tools: createDebugState(),
		resources: createDebugState(),
		prompts: createDebugState(),
	});

	const {
		data: server,
		isLoading,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: ["server", serverId],
		queryFn: () => serversApi.getServer(serverId || ""),
		enabled: !!serverId,
	});

	const toggleServerM = useMutation({
		mutationFn: async (enable: boolean) => {
			if (!serverId) throw new Error("Server ID is required");
			return enable
				? serversApi.enableServer(serverId)
				: serversApi.disableServer(serverId);
		},
		onSuccess: (_, enable) => {
			notifySuccess(enable ? "Server enabled" : "Server disabled");
			queryClient.invalidateQueries({ queryKey: ["server", serverId] });
			queryClient.invalidateQueries({ queryKey: ["servers"] });
		},
		onError: (e, enable) => {
			const message = e instanceof Error ? e.message : String(e);
			notifyError(
				"Operation failed",
				`Unable to ${enable ? "enable" : "disable"} server: ${message}`,
			);
		},
	});

	const deleteServerM = useMutation({
		mutationFn: async () => {
			if (!serverId) throw new Error("Server ID is required");
			return serversApi.deleteServer(serverId);
		},
		onSuccess: () => {
			notifySuccess("Server deleted");
			queryClient.invalidateQueries({ queryKey: ["servers"] });
			queryClient.removeQueries({ queryKey: ["server", serverId] });
			navigate("/servers");
		},
		onError: (e) => notifyError("Delete failed", String(e)),
	});

	const activeProfilesQ = useQuery({
		queryKey: ["inspector-proxy-profiles", serverId],
		enabled:
			!!serverId &&
			viewMode === VIEW_MODES.debug &&
			requestedChannel === "proxy",
		queryFn: async () => {
			const suitsResp = await configSuitsApi.getAll();
			const active = suitsResp.suits.filter((s) => s.is_active);
			const enabled: string[] = [];
			await Promise.all(
				active.map(async (suit) => {
					try {
						const res = await configSuitsApi.getServers(suit.id);
						const match = (res.servers || []).find(
							(srv) => srv.id === serverId && srv.enabled,
						);
						if (match) enabled.push(suit.name || suit.id);
					} catch (error) {
						console.error("Failed to load servers for suit", suit.id, error);
					}
				}),
			);
			return {
				activeNames: active.map((s) => s.name || s.id),
				enabledNames: enabled,
			};
		},
	});

	const rawProxyAvailable =
		(activeProfilesQ.data?.enabledNames?.length ?? 0) > 0;
	const isProxyChecking =
		viewMode === VIEW_MODES.debug &&
		activeProfilesQ.isFetching &&
		!activeProfilesQ.isFetched;
	const [proxyAvailable, setProxyAvailable] = useState(rawProxyAvailable);

	useEffect(() => {
		const timer = setTimeout(() => {
			setProxyAvailable(rawProxyAvailable);
		}, 180);
		return () => clearTimeout(timer);
	}, [rawProxyAvailable]);

	useEffect(() => {
		if (ignoreLocationChange.current) {
			ignoreLocationChange.current = false;
			return;
		}
		const params = new URLSearchParams(location.search);
		const viewParam = params.get("view");
		if (viewParam === VIEW_MODES.debug || viewParam === VIEW_MODES.browse) {
			if (viewParam !== viewMode) {
				setViewMode(viewParam);
			}
		} else if (viewMode !== VIEW_MODES.browse) {
			setViewMode(VIEW_MODES.browse);
		}

		const channelParam = params.get("channel");
		if (channelParam === "proxy" || channelParam === "native") {
			setRequestedChannel(channelParam);
		} else {
			setRequestedChannel("native");
		}
	}, [location.search, setViewMode, viewMode]);

	useEffect(() => {
		if (viewMode !== VIEW_MODES.debug) {
			if (channel !== "native") {
				setChannel("native");
			}
			return;
		}

		const desiredChannel: InspectorChannel =
			requestedChannel === "proxy"
				? proxyAvailable
					? "proxy"
					: "native"
				: "native";

		if (channel !== desiredChannel) {
			setChannel(desiredChannel);
		}
	}, [channel, proxyAvailable, requestedChannel, setChannel, viewMode]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		let changed = false;
		if (params.get("view") !== viewMode) {
			params.set("view", viewMode);
			changed = true;
		}
		if (params.get("channel") !== requestedChannel) {
			params.set("channel", requestedChannel);
			changed = true;
		}
		if (changed) {
			ignoreLocationChange.current = true;
			navigate(
				{ pathname: location.pathname, search: params.toString() },
				{ replace: true },
			);
		}
	}, [viewMode, requestedChannel, location.pathname, navigate]);

	useEffect(() => {
		try {
			if (typeof window !== "undefined") {
				window.localStorage.setItem("mcp_inspector_channel", requestedChannel);
			}
		} catch {
			/* noop */
		}
	}, [requestedChannel]);

	const pushLog = useCallback((entry: InspectorLogEntry) => {
		setLogs((prev) => {
			const next = [...prev, entry];
			if (next.length > 200) next.shift();
			return next;
		});
	}, []);

	const clearLogsByPrefix = useCallback((prefix: string) => {
		setLogs((prev) => prev.filter((entry) => !entry.method.startsWith(prefix)));
	}, []);

	const updateDebugState = useCallback(
		(kind: DebugKind, patch: Partial<DebugState>) => {
			setDebugData((prev) => ({
				...prev,
				[kind]: {
					...prev[kind],
					...patch,
				},
			}));
		},
		[],
	);

	const runList = useCallback(
		async (kind: DebugKind) => {
			if (!serverId) return;
			if (channel === "proxy" && !proxyAvailable) {
				updateDebugState(kind, {
					error:
						"Proxy mode unavailable: server not enabled in any active profile.",
				});
				return;
			}
			const method =
				kind === "tools"
					? "tools/list"
					: kind === "resources"
						? "resources/list"
						: "prompts/list";
			const requestPayload: Record<string, unknown> = {
				server_id: serverId,
				mode: channel,
				refresh: true,
			};
			if (server?.name) requestPayload.server_name = server.name;

			updateDebugState(kind, { loading: true, error: null });
			pushLog({
				id: makeLogId(),
				timestamp: Date.now(),
				channel: "inspector",
				event: "request",
				method,
				mode: channel,
				payload: requestPayload,
			});

			try {
				let resp: any;
				if (kind === "tools") {
					resp = await inspectorApi.toolsList(requestPayload as any);
				} else if (kind === "resources") {
					resp = await inspectorApi.resourcesList(requestPayload as any);
				} else {
					resp = await inspectorApi.promptsList(requestPayload as any);
				}
				const data = resp?.data || {};
				const list = Array.isArray(data.tools)
					? data.tools
					: Array.isArray(data.resources)
						? data.resources
						: Array.isArray(data.prompts)
							? data.prompts
							: [];
				updateDebugState(kind, {
					loading: false,
					error: null,
					fetched: true,
					items: list,
					lastFetched: Date.now(),
				});
				pushLog({
					id: makeLogId(),
					timestamp: Date.now(),
					channel: "inspector",
					event: "success",
					method,
					mode: channel,
					payload: { count: list.length },
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				updateDebugState(kind, { loading: false, error: message });
				pushLog({
					id: makeLogId(),
					timestamp: Date.now(),
					channel: "inspector",
					event: "error",
					method,
					mode: channel,
					message,
					payload: error,
				});
			}
		},
		[
			channel,
			proxyAvailable,
			pushLog,
			server?.name,
			serverId,
			updateDebugState,
		],
	);

	const handleInspect = useCallback(
		(kind: InspectorTarget["kind"], item: any) => {
			setInspector({ kind, item });
		},
		[],
	);

	if (!serverId) {
		return <div className="p-4">No server ID provided</div>;
	}

	const serverDisplayName = server?.name || serverId;
	const defaultTab = viewMode === VIEW_MODES.debug ? "tools" : "overview";
	const serverEnabled = Boolean(server?.enabled ?? server?.globally_enabled);
	const runtimeStatus = server?.status ?? (serverEnabled ? "idle" : "disabled");

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-3">
					<h2 className="text-3xl font-bold tracking-tight">
						{serverDisplayName}
					</h2>
					{server ? (
						<StatusBadge
							status={runtimeStatus}
							instances={server.instances || []}
							isServerEnabled={serverEnabled}
						/>
					) : null}
				</div>
				{enableServerDebug && (
					<div className="inline-flex rounded-md border bg-white dark:bg-slate-900 self-start">
						<Button
							type="button"
							size="sm"
							variant={viewMode === VIEW_MODES.browse ? "default" : "ghost"}
							onClick={() => setViewMode(VIEW_MODES.browse)}
							className="gap-1"
						>
							<Eye className="h-4 w-4" /> Browse
						</Button>
						<Button
							type="button"
							size="sm"
							variant={viewMode === VIEW_MODES.debug ? "default" : "ghost"}
							onClick={() => setViewMode(VIEW_MODES.debug)}
							className="gap-1"
						>
							<Bug className="h-4 w-4" />
						</Button>
					</div>
				)}
			</div>

			{server && (
				<>
					<ServerFormDrawer
						isOpen={isEditOpen}
						onClose={() => setIsEditOpen(false)}
						initialData={{
							name: server.name,
							kind: (server.kind as any) || "stdio",
							command: server.command,
							args: Array.isArray(server.args) ? server.args : [],
							env: server.env || {},
						}}
						onSubmit={async (data) => {
							await serversApi.updateServer(serverId, data);
							setIsEditOpen(false);
							queryClient.invalidateQueries({ queryKey: ["server", serverId] });
						}}
						title="Edit Server"
						submitLabel="Update"
						isEditing
					/>

					<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Server</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => deleteServerM.mutate()}
									disabled={deleteServerM.isPending}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									{deleteServerM.isPending ? "Deleting..." : "Delete"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}

			{server && (
				<Tabs key={viewMode} defaultValue={defaultTab} className="space-y-4">
					<div className="flex items-center justify-between gap-2 flex-wrap">
						<ServerCapabilityTabsHeader
							serverId={serverId}
							viewMode={viewMode}
						/>
						{viewMode === VIEW_MODES.debug ? (
							<InspectorChannelControls
								selected={requestedChannel}
								active={channel}
								proxyAvailable={proxyAvailable}
								isChecking={isProxyChecking}
								onSelect={setRequestedChannel}
								onOpenProfiles={() => navigate("/profiles")}
							/>
						) : null}
					</div>

					{viewMode === VIEW_MODES.browse ? (
						<TabsContent value="overview">
							{isLoading ? (
								<Card>
									<CardContent className="p-4">
										<div className="h-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
									</CardContent>
								</Card>
							) : (
								<div className="grid gap-4">
									<Card>
										<CardContent className="p-4">
											<div className="flex flex-col gap-4">
												<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
													<div className="flex flex-wrap items-start gap-4">
														<Avatar className="h-20 w-20 text-xl">
															<AvatarFallback>
																{serverDisplayName.slice(0, 1).toUpperCase()}
															</AvatarFallback>
														</Avatar>
														<div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
															<span className="text-xs uppercase text-slate-500">
																Service
															</span>
															<Badge
																variant={
																	serverEnabled ? "secondary" : "outline"
																}
																className={`justify-self-start ${serverEnabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" : "text-slate-600 dark:text-slate-300"}`}
															>
																{serverEnabled ? "Enabled" : "Disabled"}
															</Badge>
															<span className="text-xs uppercase text-slate-500">
																Runtime
															</span>
															<StatusBadge
																status={runtimeStatus}
																instances={server.instances || []}
																isServerEnabled={serverEnabled}
																className="justify-self-start"
															/>
															<span className="text-xs uppercase text-slate-500">
																Type
															</span>
															<span className="font-mono text-sm leading-tight">
																{server.kind}
															</span>
															{server.command ? (
																<>
																	<span className="text-xs uppercase text-slate-500">
																		Command
																	</span>
																	<span className="font-mono text-xs md:text-sm break-all">
																		{server.command}
																	</span>
																</>
															) : null}
															<span className="text-xs uppercase text-slate-500">
																Repository
															</span>
															<span className="font-mono text-xs text-slate-500">
																—
															</span>
														</div>
													</div>
													{viewMode === VIEW_MODES.browse ? (
														<div className="flex flex-wrap items-start justify-end gap-2 self-start">
															<Button
																size="sm"
																variant="outline"
																onClick={() => refetch()}
																disabled={isRefetching}
																className="gap-2"
															>
																<RefreshCw
																	className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
																/>
																Refresh
															</Button>
															<Button
																size="sm"
																variant="outline"
																onClick={() => setIsEditOpen(true)}
																className="gap-2"
															>
																<Edit3 className="h-4 w-4" />
																Edit
															</Button>
															<Button
																size="sm"
																variant="outline"
																onClick={() =>
																	toggleServerM.mutate(!serverEnabled)
																}
																disabled={toggleServerM.isPending}
																className="gap-2"
															>
																{serverEnabled ? (
																	<>
																		<PowerOff className="h-4 w-4" />
																		Disable
																	</>
																) : (
																	<>
																		<Power className="h-4 w-4" />
																		Enable
																	</>
																)}
															</Button>
															<Button
																size="sm"
																variant="destructive"
																onClick={() => setIsDeleteOpen(true)}
																disabled={deleteServerM.isPending}
																className="gap-2"
															>
																<Trash2 className="h-4 w-4" />
																Delete
															</Button>
														</div>
													) : null}
												</div>
											</div>
										</CardContent>
									</Card>

									{viewMode === VIEW_MODES.browse ? (
										<Card>
											<CardHeader>
												<CardTitle>
													Instances ({server.instances?.length || 0})
												</CardTitle>
											</CardHeader>
											<CardContent>
												{server.instances?.length ? (
													<div className="space-y-2">
														{server.instances.map((i) => (
															<div
																key={i.id}
																className="rounded border p-3 text-sm flex items-center justify-between cursor-pointer hover:bg-accent/50"
																onClick={() =>
																	navigate(
																		`/servers/${encodeURIComponent(serverId)}/instances/${encodeURIComponent(i.id)}`,
																	)
																}
															>
																<div className="font-mono">{i.id}</div>
																<div className="text-xs text-slate-500">
																	{String(i.status)}
																</div>
															</div>
														))}
													</div>
												) : (
													<div className="text-slate-500">No instances.</div>
												)}
											</CardContent>
										</Card>
									) : null}
								</div>
							)}
						</TabsContent>
					) : null}

					<TabsContent value="tools">
						{viewMode === VIEW_MODES.browse ? (
							<ServerCapabilityList kind="tools" serverId={serverId} />
						) : (
							<InspectorDebugSection
								kind="tools"
								state={debugData.tools}
								disabled={channel === "proxy" && !proxyAvailable}
								onFetch={() => runList("tools")}
								onInspect={(item) => handleInspect("tool", item)}
								logs={logs}
								onClearLogs={() => clearLogsByPrefix("tools/")}
							/>
						)}
					</TabsContent>

					<TabsContent value="resources">
						{viewMode === VIEW_MODES.browse ? (
							<ServerCapabilityList kind="resources" serverId={serverId} />
						) : (
							<InspectorDebugSection
								kind="resources"
								state={debugData.resources}
								disabled={channel === "proxy" && !proxyAvailable}
								onFetch={() => runList("resources")}
								onInspect={(item) => handleInspect("resource", item)}
								logs={logs}
								onClearLogs={() => clearLogsByPrefix("resources/")}
							/>
						)}
					</TabsContent>

					<TabsContent value="prompts">
						{viewMode === VIEW_MODES.browse ? (
							<ServerCapabilityList kind="prompts" serverId={serverId} />
						) : (
							<InspectorDebugSection
								kind="prompts"
								state={debugData.prompts}
								disabled={channel === "proxy" && !proxyAvailable}
								onFetch={() => runList("prompts")}
								onInspect={(item) => handleInspect("prompt", item)}
								logs={logs}
								onClearLogs={() => clearLogsByPrefix("prompts/")}
							/>
						)}
					</TabsContent>

					<TabsContent value="templates">
						{viewMode === VIEW_MODES.browse ? (
							<ServerCapabilityList kind="templates" serverId={serverId} />
						) : (
							<Card>
								<CardHeader>
									<CardTitle>Resource Templates</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-slate-600 dark:text-slate-300">
										MCP resource templates are not yet available through the
										Inspector debug channel.
									</p>
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>
			)}
			<InspectorDrawer
				open={!!inspector}
				onOpenChange={(open) => {
					if (!open) setInspector(null);
				}}
				serverId={serverId}
				serverName={server?.name}
				kind={inspector?.kind ?? "tool"}
				item={inspector?.item}
				mode={channel}
				onLog={pushLog}
			/>
		</div>
	);
}

type HeaderKinds = "tools" | "resources" | "prompts" | "templates";

function ServerCapabilityTabsHeader({
	serverId,
	viewMode,
}: {
	serverId: string;
	viewMode: keyof typeof VIEW_MODES;
}) {
	const toolsQ = useQuery({
		queryKey: ["server-cap", "tools", serverId],
		queryFn: () => serversApi.listTools(serverId),
	});
	const resQ = useQuery({
		queryKey: ["server-cap", "resources", serverId],
		queryFn: () => serversApi.listResources(serverId),
	});
	const prmQ = useQuery({
		queryKey: ["server-cap", "prompts", serverId],
		queryFn: () => serversApi.listPrompts(serverId),
	});
	const tmpQ = useQuery({
		queryKey: ["server-cap", "templates", serverId],
		queryFn: () => serversApi.listResourceTemplates(serverId),
	});

	const toolsCount = toolsQ.data?.items?.length ?? 0;
	const resourcesCount = resQ.data?.items?.length ?? 0;
	const promptsCount = prmQ.data?.items?.length ?? 0;
	const templatesCount = tmpQ.data?.items?.length ?? 0;
	const disableEmpty = true;

	return (
		<TabsList className="flex flex-wrap gap-2">
			{viewMode === VIEW_MODES.browse ? (
				<TabsTrigger value="overview">Overview</TabsTrigger>
			) : null}
			<TabsTrigger value="tools" disabled={disableEmpty && toolsCount === 0}>
				Tools ({toolsCount})
			</TabsTrigger>
			<TabsTrigger
				value="resources"
				disabled={disableEmpty && resourcesCount === 0}
			>
				Resources ({resourcesCount})
			</TabsTrigger>
			<TabsTrigger
				value="prompts"
				disabled={disableEmpty && promptsCount === 0}
			>
				Prompts ({promptsCount})
			</TabsTrigger>
			<TabsTrigger
				value="templates"
				disabled={disableEmpty && templatesCount === 0}
			>
				Resource Templates ({templatesCount})
			</TabsTrigger>
		</TabsList>
	);
}

function ServerCapabilityList({
	kind,
	serverId,
}: {
	kind: "tools" | "resources" | "prompts" | "templates";
	serverId: string;
}) {
	const [search, setSearch] = useState("");
	const queryMap = {
		tools: useQuery({
			queryKey: ["server-cap", "tools", serverId],
			queryFn: () => serversApi.listTools(serverId),
		}),
		resources: useQuery({
			queryKey: ["server-cap", "resources", serverId],
			queryFn: () => serversApi.listResources(serverId),
		}),
		prompts: useQuery({
			queryKey: ["server-cap", "prompts", serverId],
			queryFn: () => serversApi.listPrompts(serverId),
		}),
		templates: useQuery({
			queryKey: ["server-cap", "templates", serverId],
			queryFn: () => serversApi.listResourceTemplates(serverId),
		}),
	} as const;
	const q = queryMap[kind];
	const titleMap: Record<HeaderKinds, string> = {
		tools: "Tools",
		resources: "Resources",
		prompts: "Prompts",
		templates: "Resource Templates",
	} as const;

	return (
		<CapabilityList
			title={`${titleMap[kind]} (${q.data?.items?.length ?? 0})`}
			kind={kind}
			context="server"
			items={(q.data?.items as any[]) || []}
			loading={q.isLoading}
			filterText={search}
			onFilterTextChange={setSearch}
			emptyText={`No ${titleMap[kind].toLowerCase()} from this server`}
		/>
	);
}

interface InspectorDebugSectionProps {
	kind: DebugKind;
	state: DebugState;
	disabled?: boolean;
	onFetch: () => void;
	onInspect: (item: any) => void;
	logs: InspectorLogEntry[];
	onClearLogs: () => void;
}

interface InspectorChannelControlsProps {
	selected: InspectorChannel;
	active: InspectorChannel;
	proxyAvailable: boolean;
	isChecking?: boolean;
	onSelect: (channel: InspectorChannel) => void;
	onOpenProfiles: () => void;
}

function InspectorChannelControls({
	selected,
	active,
	proxyAvailable,
	isChecking,
	onSelect,
	onOpenProfiles,
}: InspectorChannelControlsProps) {
	const [hintVisible, setHintVisible] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (proxyAvailable) {
			setHintVisible(false);
		}
	}, [proxyAvailable]);

	useEffect(() => {
		if (isChecking) {
			setHintVisible(false);
		}
	}, [isChecking]);

	useEffect(() => {
		if (selected !== "proxy") {
			setHintVisible(false);
		}
	}, [selected]);

	useEffect(() => {
		if (!hintVisible) return;
		const handler = (event: PointerEvent) => {
			if (containerRef.current?.contains(event.target as Node)) {
				return;
			}
			setHintVisible(false);
		};
		window.addEventListener("pointerdown", handler, { capture: true });
		return () =>
			window.removeEventListener("pointerdown", handler, { capture: true });
	}, [hintVisible]);

	const handleProxy = () => {
		onSelect("proxy");
		if (proxyAvailable && !isChecking) {
			setHintVisible(false);
		} else {
			setHintVisible(true);
		}
	};

	const handleNative = () => {
		onSelect("native");
		setHintVisible(false);
	};

	return (
		<div ref={containerRef} className="relative inline-flex items-center gap-2">
			{selected === "proxy" && active !== "proxy" && !isChecking ? (
				<span className="text-xs text-amber-600 dark:text-amber-400 mr-2">
					Fallback to native until proxy is available
				</span>
			) : null}
			<div className="inline-flex rounded-md border bg-white dark:bg-slate-900">
				<Button
					type="button"
					size="sm"
					variant={selected === "proxy" ? "default" : "ghost"}
					className="gap-1 h-8 px-3 text-xs"
					disabled={isChecking}
					onClick={handleProxy}
				>
					{isChecking ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<ShieldAlert className="h-4 w-4" />
					)}
					Proxy
				</Button>
				<Button
					type="button"
					size="sm"
					variant={selected === "native" ? "default" : "ghost"}
					className="gap-1 h-8 px-3 text-xs"
					onClick={handleNative}
				>
					<AlertTriangle className="h-4 w-4" /> Native
				</Button>
			</div>
			{!proxyAvailable && !isChecking && hintVisible ? (
				<div className="absolute right-0 top-full mt-1 w-64 rounded-md border bg-white dark:bg-slate-900 p-3 text-xs shadow-lg z-10">
					<p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
						Proxy unavailable
					</p>
					<p className="text-slate-600 dark:text-slate-300 mb-2">
						Enable this server in an active profile to exercise proxy mode.
					</p>
					<Button
						size="sm"
						variant="outline"
						className="text-xs"
						onClick={onOpenProfiles}
					>
						Open Profiles
					</Button>
				</div>
			) : null}
		</div>
	);
}

function InspectorDebugSection({
	kind,
	state,
	disabled,
	onFetch,
	onInspect,
	logs,
	onClearLogs,
}: InspectorDebugSectionProps) {
	const [filter, setFilter] = useState("");
	const [tab, setTab] = useState<"results" | "logs">("results");

	const title = useMemo(() => {
		if (kind === "tools") return "Tools";
		if (kind === "resources") return "Resources";
		return "Prompts";
	}, [kind]);

	const sectionLogs = useMemo(() => {
		const prefix =
			kind === "tools"
				? "tools/"
				: kind === "resources"
					? "resources/"
					: "prompts/";
		return logs.filter((entry) => entry.method.startsWith(prefix));
	}, [logs, kind]);

	return (
		<Tabs
			value={tab}
			onValueChange={(v) => setTab(v as "results" | "logs")}
			className="w-full space-y-4"
		>
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<TabsList className="flex flex-wrap gap-2">
					<TabsTrigger value="results">
						Results ({state.items.length})
					</TabsTrigger>
					<TabsTrigger value="logs">
						Inspector Logs ({sectionLogs.length})
					</TabsTrigger>
				</TabsList>
				{tab === "results" ? (
					<div className="flex items-center gap-2 flex-wrap">
						<Input
							placeholder={`Filter ${title.toLowerCase()}...`}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							className="h-8 w-48"
						/>
						<Button
							size="sm"
							onClick={onFetch}
							disabled={disabled || state.loading}
							className="h-8 gap-2"
						>
							{state.loading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							{state.fetched ? "Refresh" : "List"}
						</Button>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							className="h-8"
							onClick={onClearLogs}
							disabled={!sectionLogs.length}
						>
							Clear Logs
						</Button>
					</div>
				)}
			</div>

			<TabsContent value="results" className="space-y-4">
				<Card className="min-h-[220px]">
					<CardHeader className="px-4 pt-4 pb-0">
						{state.lastFetched ? (
							<p className="text-xs text-slate-500">
								Last listed at{" "}
								{new Date(state.lastFetched).toLocaleTimeString()}
							</p>
						) : null}
						{state.error ? (
							<p className="text-xs text-red-500 mt-1">{state.error}</p>
						) : null}
					</CardHeader>
					<CardContent className="p-4">
						<CapabilityList
							asCard={false}
							title={undefined}
							kind={kind}
							context="server"
							items={state.fetched ? state.items : []}
							loading={state.loading}
							filterText={filter}
							emptyText={
								state.fetched
									? `No ${title.toLowerCase()} returned.`
									: `Run ${title.toLowerCase()} list to fetch live data.`
							}
							renderAction={(m, item) => (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="gap-1"
									onClick={() => onInspect(item)}
								>
									<Play className="w-3.5 h-3.5" /> Inspect
								</Button>
							)}
						/>
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="logs" className="space-y-4">
				<Card className="min-h-[220px]">
					<CardContent className="space-y-2 p-4 max-h-[60vh] overflow-auto">
						{sectionLogs.length === 0 ? (
							<p className="text-sm text-slate-500">No inspector events yet.</p>
						) : (
							sectionLogs.map((entry) => (
								<div
									key={entry.id}
									className="border rounded-md p-2 bg-slate-50 dark:bg-slate-900 text-xs space-y-1"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="font-mono text-[11px] text-slate-500">
											{new Date(entry.timestamp).toLocaleTimeString()}
										</span>
										<span className="font-mono text-[11px] text-slate-500">
											{entry.method}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant={
												entry.event === "error"
													? "destructive"
													: entry.event === "success"
														? "success"
														: "secondary"
											}
											className="text-[10px] uppercase"
										>
											{entry.event}
										</Badge>
										<Badge variant="outline" className="text-[10px] uppercase">
											{entry.mode}
										</Badge>
									</div>
									{entry.message ? (
										<p className="text-red-500">{entry.message}</p>
									) : null}
									{entry.payload !== undefined ? (
										<pre className="bg-white dark:bg-slate-950 border rounded p-2 max-h-48 overflow-auto">
											{safeLog(entry.payload)}
										</pre>
									) : null}
								</div>
							))
						)}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	);
}

function safeLog(value: unknown) {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export default ServerDetailPage;
