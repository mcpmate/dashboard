import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowUp,
	ExternalLink,
	EyeOff,
	Loader2,
	Plug,
	Plus,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorDisplay } from "../../components/error-display";
import { Pagination } from "../../components/pagination";
import { ServerInstallDrawer } from "../../components/server-install-drawer";
import {
	ServerInstallManualForm,
	type ServerInstallManualFormHandle,
} from "../../components/server-install-manual-form";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/select";
import { useCursorPagination } from "../../hooks/use-cursor-pagination";
import {
	type ServerInstallDraft,
	useServerInstallPipeline,
} from "../../hooks/use-server-install-pipeline";
import { notifyError, notifyInfo } from "../../lib/notify";
import { fetchRegistryServers, getOfficialMeta } from "../../lib/registry";
import { useAppStore } from "../../lib/store";
import type { RegistryServerEntry } from "../../lib/types";
import { cn, formatRelativeTime, truncate } from "../../lib/utils";

interface MarketCardProps {
	server: RegistryServerEntry;
	onPreview: (server: RegistryServerEntry) => void;
	onHide: (server: RegistryServerEntry) => void;
	enableBlacklist: boolean;
}

type SortOption = "recent" | "name";

// Tab management types
interface TabItem {
	id: string;
	label: string;
	type: "official" | "third-party";
	url?: string;
	closable: boolean;
}

// Market mode types and interfaces
interface RemoteOption {
	id: string;
	label: string;
	kind: string;
	source: "remote" | "package";
	url: string | null;
	headers: Array<{
		name: string;
		isRequired?: boolean;
		description?: string;
	}> | null;
	envVars: Array<{
		name: string;
		isRequired?: boolean;
		description?: string;
	}> | null;
	packageIdentifier: string | null;
	packageMeta: unknown;
}

function useDebouncedValue<T>(value: T, delay = 300) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(handle);
	}, [value, delay]);
	return debounced;
}

function hasPreviewableOption(server: RegistryServerEntry | null): boolean {
	if (!server) return false;
	const hasRemote = (server.remotes ?? []).some(
		(remote) =>
			Boolean(normalizeRemoteKind(remote.type)) && Boolean(remote.url),
	);
	const hasPackage = (server.packages ?? []).some((pkg) =>
		Boolean(normalizeRemoteKind(pkg.transport?.type)),
	);
	return hasRemote || hasPackage;
}

function formatServerName(raw: string) {
	if (!raw) return "Unknown";
	const segments = raw.split("/").filter(Boolean);
	const target = segments[segments.length - 1] ?? raw;
	return target
		.replace(/[-_]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getRegistryIdentity(server: RegistryServerEntry): string {
	const official = getOfficialMeta(server);
	if (official?.serverId) {
		return official.serverId;
	}
	return `${server.name}@${server.version}`;
}

// Market mode helper functions
function normalizeRemoteKind(value?: string | null): string | null {
	if (!value) return null;
	const lower = value.toLowerCase();
	if (lower === "sse") return "sse";
	if (lower === "streamable-http" || lower === "streamable_http")
		return "streamable_http";
	if (lower === "stdio") return "stdio";
	return null;
}

function getRemoteTypeLabel(type: string): string {
	switch (type.toLowerCase()) {
		case "sse":
			return "SSE";
		case "streamable_http":
		case "streamable-http":
			return "Streamable HTTP";
		case "stdio":
			return "Stdio";
		default:
			return type;
	}
}

function slugifyForConfig(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "registry-server";
}

function buildDraftFromRemoteOption(
	option: RemoteOption,
	fallbackName: string,
): ServerInstallDraft {
	const descriptors =
		option.source === "package"
			? (option.envVars ?? [])
			: (option.headers ?? []);

	const env: Record<string, string> = {};
	descriptors.forEach((descriptor) => {
		env[descriptor.name] = "";
	});

	if (option.source === "package") {
		// For packages, we need to build command and args
		const identifier = option.packageIdentifier || "";
		const registryType =
			(
				option.packageMeta as { registryType?: string }
			)?.registryType?.toLowerCase() || "";

		let command = "";
		let args: string[] = [];

		if (
			registryType === "pip" ||
			registryType === "pypi" ||
			registryType === "python"
		) {
			command = "uvx";
			args = [identifier];
		} else if (registryType === "bun" || registryType === "bunx") {
			command = "bunx";
			args = ["-y", identifier];
		} else {
			command = "npx";
			args = ["-y", identifier];
		}

		return {
			name: fallbackName,
			kind: option.kind as "stdio" | "sse" | "streamable_http",
			url: undefined,
			command,
			args,
			env,
		};
	}

	return {
		name: fallbackName,
		kind: option.kind as "stdio" | "sse" | "streamable_http",
		url: option.url || "",
		command: "",
		args: [],
		env,
	};
}

function MarketCard({
	server,
	onPreview,
	onHide,
	enableBlacklist,
}: MarketCardProps) {
	const official = getOfficialMeta(server);
	const transportBadges = useMemo(() => {
		const set = new Set(
			(server.remotes ?? [])
				.map((remote) => remote.type)
				.filter((type): type is string => Boolean(type)),
		);
		if (server.packages) {
			for (const pkg of server.packages) {
				if (pkg.transport?.type) {
					set.add(pkg.transport.type);
				}
			}
		}
		return Array.from(set);
	}, [server.packages, server.remotes]);

	const publishedLabel = official?.updatedAt ?? official?.publishedAt;
	const relativeTimestamp = publishedLabel
		? formatRelativeTime(publishedLabel)
		: null;
	const displayName = formatServerName(server.name);

	const supportsPreview = useMemo(() => hasPreviewableOption(server), [server]);

	const handleCardClick = () => {
		if (!supportsPreview) {
			notifyInfo(
				"Preview unavailable",
				"This registry entry does not expose a previewable transport option.",
			);
			return;
		}
		onPreview(server);
	};

	return (
		<Card
			role="button"
			tabIndex={supportsPreview ? 0 : -1}
			onClick={handleCardClick}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					handleCardClick();
				}
			}}
			className={cn(
				"group flex h-full cursor-pointer flex-col overflow-hidden border border-slate-200 transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 dark:border-slate-800",
				supportsPreview ? "cursor-pointer" : "cursor-not-allowed opacity-95",
			)}
		>
			<CardHeader className="p-4">
				<div className="flex items-start gap-3">
					<Avatar className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-sm font-medium flex-shrink-0">
						<AvatarFallback>
							{displayName.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>

					<div className="flex-1 min-w-0 space-y-1">
						{/* 标题和传输类型标签在同一行 */}
						<div className="flex items-start justify-between gap-3">
							<CardTitle
								className="text-lg font-semibold leading-tight truncate"
								title={displayName}
							>
								{displayName}
							</CardTitle>

							{/* 右上角传输类型标签 */}
							{transportBadges.length > 0 && (
								<div className="flex justify-end items-start flex-shrink-0">
									<div className="flex flex-row-reverse gap-1 flex-nowrap">
										{transportBadges.map((type) => (
											<Badge
												key={type}
												variant="outline"
												className="rounded-full border-primary/40 bg-primary/5 px-2 py-0 text-[11px] font-medium text-primary"
											>
												<Plug className="mr-1 h-3 w-3" />
												{getRemoteTypeLabel(type)}
											</Badge>
										))}
									</div>
								</div>
							)}
						</div>

						{/* 版本和更新时间 - 与标题左对齐 */}
						<div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
							<span>{`Version ${server.version}`}</span>
							{relativeTimestamp && (
								<>
									<span>•</span>
									<span>Updated {relativeTimestamp}</span>
								</>
							)}
						</div>

						{/* 描述 - 与标题左对齐 */}
						<div className="h-15 flex items-start">
							<CardDescription className="text-sm text-slate-500 line-clamp-3 leading-5">
								{truncate(server.description, 320) || "N/A"}
							</CardDescription>
						</div>
					</div>
				</div>
			</CardHeader>

			<CardFooter className="flex items-center justify-between gap-2 px-4 pb-4 pt-0 mt-auto">
				<div className="flex items-center gap-3">
					<div className="w-12"></div>
					{enableBlacklist && (
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onHide(server);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										event.stopPropagation();
										onHide(server);
									}
								}}
								className="inline-flex items-center justify-center rounded-full border border-transparent bg-transparent h-5 w-5 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-slate-500 dark:hover:text-slate-300"
								title="Hide this server"
							>
								<EyeOff className="h-4 w-4" />
								<span className="sr-only">Hide server</span>
							</button>
						</div>
					)}
				</div>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							const target = server.repository?.url ?? server.websiteUrl;
							if (target) {
								window.open(target, "_blank", "noopener,noreferrer");
							} else {
								notifyInfo(
									"Registry entry",
									"No external project URL provided for this server.",
								);
							}
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								event.stopPropagation();
								const target = server.repository?.url ?? server.websiteUrl;
								if (target) {
									window.open(target, "_blank", "noopener,noreferrer");
								} else {
									notifyInfo(
										"Registry entry",
										"No external project URL provided for this server.",
									);
								}
							}
						}}
						className={cn(
							"inline-flex items-center justify-center rounded-full border border-transparent bg-transparent h-5 w-5 text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
							!server.repository?.url && !server.websiteUrl
								? "cursor-not-allowed opacity-60"
								: "",
						)}
						disabled={!server.repository?.url && !server.websiteUrl}
						title="Open project details"
					>
						<ExternalLink className="h-4 w-4" />
						<span className="sr-only">Open project site</span>
					</button>
				</div>
			</CardFooter>
		</Card>
	);
}

// Server Grid Component - Unified component for server cards and pagination
interface ServerGridProps {
	servers: RegistryServerEntry[];
	isInitialLoading: boolean;
	isPageLoading: boolean;
	isEmpty: boolean;
	pagination: {
		currentPage: number;
		hasPreviousPage: boolean;
		hasNextPage: boolean;
		itemsPerPage: number;
	};
	onServerPreview: (server: RegistryServerEntry) => void;
	onServerHide: (server: RegistryServerEntry) => void;
	enableBlacklist: boolean;
	onNextPage: () => void;
	onPreviousPage: () => void;
}

function ServerGrid({
	servers,
	isInitialLoading,
	isPageLoading,
	isEmpty,
	pagination,
	onServerPreview,
	onServerHide,
	enableBlacklist,
	onNextPage,
	onPreviousPage,
}: ServerGridProps) {
	return (
		<>
			{/* Loading Skeleton */}
			{isInitialLoading ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 9 }, (_, index) => {
						const uniqueKey = `skeleton-card-${Date.now()}-${index}`;
						return (
							<Card
								key={uniqueKey}
								className="group flex h-full cursor-pointer flex-col overflow-hidden border border-slate-200 transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 dark:border-slate-800"
							>
								<CardHeader className="p-4">
									<div className="grid grid-cols-1 grid-rows-1">
										<div className="flex items-start gap-3 col-start-1 row-start-1">
											<div className="h-12 w-12 rounded-[10px] bg-slate-200 animate-pulse dark:bg-slate-700" />
											<div className="flex-1 space-y-2">
												<div className="h-5 w-3/4 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
												<div className="h-3 w-1/2 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
												<div className="h-3 w-full rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
												<div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
											</div>
										</div>
										<div className="col-start-1 row-start-1 flex justify-end items-start pt-1 pr-1">
											<div className="h-6 w-16 rounded-full bg-slate-200 animate-pulse dark:bg-slate-700" />
										</div>
									</div>
								</CardHeader>
								<CardFooter className="flex items-center justify-between gap-2 px-4 pb-4 pt-0 mt-auto">
									<div className="flex items-center gap-3">
										<div className="w-12"></div>
										<div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse dark:bg-slate-700" />
									</div>
									<div className="flex items-center gap-3">
										<div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse dark:bg-slate-700" />
									</div>
								</CardFooter>
							</Card>
						);
					})}
				</div>
			) : null}

			{/* Empty State */}
			{isEmpty ? (
				<div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
					No entries matched your filters. Try another name or clear the search
					above.
				</div>
			) : null}

			{/* Server Cards Grid */}
			{!isInitialLoading && !isEmpty ? (
				<div className="relative">
					{isPageLoading ? (
						<div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-slate-950/80">
							<div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-lg dark:bg-slate-800">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="text-sm font-medium">Loading...</span>
							</div>
						</div>
					) : null}
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{servers.map((server) => {
							return (
								<MarketCard
									key={`${server.name}-${server.version}`}
									server={server}
									onPreview={onServerPreview}
									onHide={onServerHide}
									enableBlacklist={enableBlacklist}
								/>
							);
						})}
					</div>
				</div>
			) : null}

			{/* Pagination */}
			{!isEmpty ? (
				<Pagination
					currentPage={pagination.currentPage}
					hasPreviousPage={pagination.hasPreviousPage}
					hasNextPage={pagination.hasNextPage}
					isLoading={isInitialLoading || isPageLoading}
					itemsPerPage={pagination.itemsPerPage}
					currentPageItemCount={servers.length}
					onPreviousPage={onPreviousPage}
					onNextPage={onNextPage}
					className="mt-6"
				/>
			) : null}
		</>
	);
}

export function MarketPage() {
	// Get default market setting
	const defaultMarket = useAppStore(
		(state) => state.dashboardSettings.defaultMarket,
	);

	// Tab management state - initialize based on default market setting
	const [tabs, setTabs] = useState<TabItem[]>(() => {
		const officialTab = {
			id: "official",
			label: "Official MCP Registry",
			type: "official" as const,
			closable: defaultMarket !== "official", // Only closable if not default
		};
		const mcpMarketTab = {
			id: "mcpmarket",
			label: "MCP Market",
			type: "third-party" as const,
			url: "https://mcpmarket.cn/",
			closable: defaultMarket !== "mcpmarket", // Only closable if not default
		};

		if (defaultMarket === "official") {
			return [officialTab];
		} else {
			return [mcpMarketTab];
		}
	});
	const [activeTab, setActiveTab] = useState<string>(defaultMarket);

	// Search and sort state (only for official tab)
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortOption>("recent");
	const debouncedSearch = useDebouncedValue(search.trim(), 300);
	const queryClient = useQueryClient();
	const marketBlacklist = useAppStore(
		(state) => state.dashboardSettings.marketBlacklist,
	);
	const addToMarketBlacklist = useAppStore(
		(state) => state.addToMarketBlacklist,
	);
	const enableMarketBlacklist = useAppStore(
		(state) => state.dashboardSettings.enableMarketBlacklist,
	);

	// Tab management functions
	const addTab = useCallback(
		(label: string, url?: string) => {
			// Handle adding official registry when default is mcpmarket
			if (label === "Official MCP Registry") {
				const officialTab: TabItem = {
					id: "official",
					label: "Official MCP Registry",
					type: "official",
					closable: defaultMarket !== "official", // Only closable if not default
				};
				setTabs((prev) => [...prev, officialTab]);
				setActiveTab("official");
				return;
			}

			// Handle adding third-party markets
			const newTab: TabItem = {
				id: `tab-${Date.now()}`,
				label,
				type: "third-party",
				url,
				closable: true, // Third-party markets are always closable
			};
			setTabs((prev) => [...prev, newTab]);
			setActiveTab(newTab.id);
		},
		[defaultMarket],
	);

	const closeTab = useCallback(
		(tabId: string) => {
			// Cannot close the default market tab
			if (tabId === defaultMarket) return;
			setTabs((prev) => {
				const newTabs = prev.filter((tab) => tab.id !== tabId);
				// If closing active tab, switch to default market tab
				if (activeTab === tabId) {
					setActiveTab(defaultMarket);
				}
				return newTabs;
			});
		},
		[activeTab, defaultMarket],
	);

	const handlePaginationReset = useCallback(() => {
		// Clear query cache when resetting pagination
		queryClient.removeQueries({ queryKey: ["market", "registry"] });
	}, [queryClient]);

	const pagination = useCursorPagination({
		limit: 9,
		onReset: handlePaginationReset,
	});

	const registryQuery = useQuery({
		queryKey: ["market", "registry", debouncedSearch, pagination.currentPage],
		queryFn: async () => {
			const result = await fetchRegistryServers({
				cursor: pagination.currentCursor,
				search: debouncedSearch || undefined,
				limit: pagination.itemsPerPage,
			});

			return result;
		},
		staleTime: 1000 * 60 * 5,
	});

	// Update pagination state when query data changes
	useEffect(() => {
		if (registryQuery.data?.metadata) {
			pagination.setHasNextPage(
				Boolean(registryQuery.data.metadata.nextCursor),
			);
		}
	}, [registryQuery.data?.metadata, pagination.setHasNextPage]);

	const blacklistIds = useMemo(() => {
		return new Set(marketBlacklist.map((entry) => entry.serverId));
	}, [marketBlacklist]);

	const servers = useMemo(() => {
		if (!registryQuery.data) return [] as RegistryServerEntry[];
		const dedup = new Map<string, RegistryServerEntry>();

		// Process servers from current page
		for (const serverEntry of registryQuery.data.servers) {
			// Extract the actual server data from the nested structure
			const server = serverEntry.server;
			if (!server) continue;

			// Create a flattened server object with _meta at the top level
			const flattenedServer: RegistryServerEntry = {
				...server,
				_meta: serverEntry._meta,
			};

			const key = getRegistryIdentity(flattenedServer);
			if (blacklistIds.has(key)) {
				continue;
			}
			const official = getOfficialMeta(flattenedServer);
			if (!dedup.has(key)) {
				dedup.set(key, flattenedServer);
				continue;
			}
			const existing = dedup.get(key);
			const existingTs = existing && getOfficialMeta(existing)?.updatedAt;
			const candidateTs = official?.updatedAt;
			if (
				existing &&
				existingTs &&
				candidateTs &&
				Date.parse(candidateTs) > Date.parse(existingTs)
			) {
				dedup.set(key, flattenedServer);
			}
		}
		return Array.from(dedup.values());
	}, [registryQuery.data, blacklistIds]);

	const sortedServers = useMemo(() => {
		const items = [...servers];
		if (sort === "recent") {
			items.sort((a, b) => {
				const metaA = getOfficialMeta(a);
				const metaB = getOfficialMeta(b);
				const tsA = metaA?.updatedAt ?? metaA?.publishedAt;
				const tsB = metaB?.updatedAt ?? metaB?.publishedAt;
				return Date.parse(tsB || "0") - Date.parse(tsA || "0");
			});
		} else {
			items.sort((a, b) =>
				formatServerName(a.name).localeCompare(formatServerName(b.name)),
			);
		}
		return items;
	}, [servers, sort]);

	const isInitialLoading = registryQuery.isLoading && !registryQuery.data;
	const isPageLoading = registryQuery.isFetching && Boolean(registryQuery.data);
	const isEmpty = !isInitialLoading && sortedServers.length === 0;
	const fetchError =
		registryQuery.error instanceof Error ? registryQuery.error : undefined;
	const lastErrorRef = useRef<string | null>(null);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [drawerServer, setDrawerServer] = useState<RegistryServerEntry | null>(
		null,
	);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [selectedTransportId, setSelectedTransportId] = useState<string>("");

	// Market mode state
	const [remoteOptions, setRemoteOptions] = useState<RemoteOption[]>([]);
	const [selectedRemote, setSelectedRemote] = useState<RemoteOption | null>(
		null,
	);
	const [initialDraft, setInitialDraft] = useState<ServerInstallDraft | null>(
		null,
	);
	const formRef = useRef<ServerInstallManualFormHandle>(null);

	// Install pipeline for preview and import
	const installPipeline = useServerInstallPipeline({
		onImported: () => {
			// Refresh the market data after successful import
			queryClient.invalidateQueries({ queryKey: ["market", "registry"] });
			// Close both drawers and return to market page
			setDrawerOpen(false);
			setDrawerServer(null);
		},
	});

	// Reset pagination when search changes
	const previousSearch = useRef(debouncedSearch);
	useEffect(() => {
		if (previousSearch.current !== debouncedSearch) {
			previousSearch.current = debouncedSearch;
			pagination.resetToFirstPage();
		}
	}, [debouncedSearch, pagination.resetToFirstPage]);

	useEffect(() => {
		if (fetchError) {
			if (lastErrorRef.current !== fetchError.message) {
				notifyError("Failed to load registry", fetchError.message);
				lastErrorRef.current = fetchError.message;
			}
		} else {
			lastErrorRef.current = null;
		}
	}, [fetchError]);

	useEffect(() => {
		const handler = () => {
			setShowScrollTop(window.scrollY > 400);
		};
		handler();
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	const handleRefresh = () => {
		const currentTab = tabs.find((tab) => tab.id === activeTab);

		if (currentTab?.type === "official") {
			// Refresh official registry data
			queryClient.removeQueries({ queryKey: ["market", "registry"] });
			registryQuery.refetch();
		} else if (currentTab?.type === "third-party" && currentTab.url) {
			// Refresh iframe by reloading it
			const iframe = document.querySelector(
				`iframe[src="${currentTab.url}"]`,
			) as HTMLIFrameElement;
			if (iframe) {
				const currentSrc = iframe.src;
				iframe.src = ""; // Clear first
				setTimeout(() => {
					iframe.src = currentSrc; // Then reload
				}, 0);
			}
		}
	};

	const handleHideServer = (entry: RegistryServerEntry) => {
		const identity = getRegistryIdentity(entry);
		const label = formatServerName(entry.name);
		addToMarketBlacklist({
			serverId: identity,
			label,
			hiddenAt: Date.now(),
		});
		notifyInfo("Server hidden", `${label} will be excluded from Market.`);
	};

	const handleOpenDrawer = (entry: RegistryServerEntry) => {
		setDrawerServer(entry);
		setDrawerOpen(true);
	};

	const handleDrawerChange = useCallback((open: boolean) => {
		setDrawerOpen(open);
		if (!open) {
			setDrawerServer(null);
		}
	}, []);

	// Preview handler for ServerInstallManualForm
	const handlePreview = useCallback(async () => {
		if (!drawerServer || !formRef.current) return;

		try {
			const currentDraft = formRef.current.getCurrentDraft();
			if (!currentDraft) {
				notifyError("Preview failed", "No server configuration found");
				return;
			}

			// Use the install pipeline to preview the server
			await installPipeline.begin([currentDraft], "market");
		} catch (error) {
			notifyError("Preview failed", String(error));
		}
	}, [drawerServer, installPipeline]);

	// Import handler (not used in market mode, but kept for compatibility)
	const handleImport = useCallback(async () => {
		// This should not be called in market mode
		// The import happens through the ServerInstallDrawer
		console.warn("handleImport called in market mode - this should not happen");
	}, []);

	// Build remote options from registry server
	useEffect(() => {
		if (!drawerServer) {
			setRemoteOptions([]);
			setSelectedRemote(null);
			setInitialDraft(null);
			return;
		}

		const options: RemoteOption[] = [];

		// Add remote options
		(drawerServer.remotes ?? []).forEach((remote, idx) => {
			const kind = normalizeRemoteKind(remote.type);
			if (!kind || !remote?.url) return;
			options.push({
				id: `${drawerServer.name}-remote-${idx}`,
				label: `${getRemoteTypeLabel(kind)} • ${remote.url}`,
				kind,
				source: "remote",
				url: remote.url,
				headers: remote.headers ?? null,
				envVars: null,
				packageIdentifier: null,
				packageMeta: null,
			});
		});

		// Add package options
		(drawerServer.packages ?? []).forEach((pkg, idx) => {
			const kind = normalizeRemoteKind(pkg.transport?.type);
			if (!kind) return;
			const identifier =
				pkg.identifier ?? pkg.registryType ?? `package-${idx + 1}`;
			const label = `${getRemoteTypeLabel(kind)} • ${identifier}`;
			options.push({
				id: `${drawerServer.name}-package-${idx}`,
				label,
				kind,
				source: "package",
				url: null,
				headers: null,
				envVars: pkg.environmentVariables ?? null,
				packageIdentifier: identifier,
				packageMeta: pkg,
			});
		});

		setRemoteOptions(options);

		// Set default selection
		if (options.length > 0) {
			const defaultOption = options[0];
			setSelectedRemote(defaultOption);
			setSelectedTransportId(defaultOption.id);
		}
	}, [drawerServer]);

	// Update selected remote when transport ID changes
	useEffect(() => {
		if (!selectedTransportId || !remoteOptions.length) return;
		const option = remoteOptions.find((opt) => opt.id === selectedTransportId);
		if (option) {
			setSelectedRemote(option);
		}
	}, [selectedTransportId, remoteOptions]);

	// Build initial draft from selected remote
	useEffect(() => {
		if (!selectedRemote || !drawerServer) {
			setInitialDraft(null);
			return;
		}

		const fallbackName = slugifyForConfig(drawerServer.name);
		const draft = buildDraftFromRemoteOption(selectedRemote, fallbackName);

		// Add meta information
		const draftWithMeta: ServerInstallDraft = {
			...draft,
			meta: {
				description: drawerServer.description || "",
				version: drawerServer.version || "",
				websiteUrl: drawerServer.websiteUrl || "",
				repository: drawerServer.repository
					? {
							url: drawerServer.repository.url || "",
							source: "",
							subfolder: "",
							id: "",
						}
					: undefined,
			},
		};

		setInitialDraft(draftWithMeta);
	}, [selectedRemote, drawerServer]);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	const handleNextPage = () => {
		if (!registryQuery.data?.metadata?.nextCursor) return;
		pagination.goToNextPage(registryQuery.data.metadata.nextCursor);
		scrollToTop();
	};

	const handlePreviousPage = () => {
		pagination.goToPreviousPage();
		scrollToTop();
	};

	return (
		<>
			<div className="space-y-4">
				<div className="sticky top-0 z-10 -mx-1 rounded-b-xl px-1 backdrop-blur">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
								Market
								<sup className="ml-2 align-super text-xs font-normal text-slate-500 dark:text-slate-400">
									alpha
								</sup>
							</h2>
						</div>
						{/* Search, Sort, and Refresh Controls - Right aligned */}
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
							{/* Search and Sort - Only show for official tab */}
							{(() => {
								const currentTab = tabs.find((tab) => tab.id === activeTab);
								return currentTab?.type === "official";
							})() && (
								<>
									<div className="flex-1 sm:flex-none">
										<Input
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											placeholder="Search by server name"
											className="h-9 w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-600 sm:w-64"
										/>
									</div>
									<Select
										value={sort}
										onValueChange={(value: SortOption) => setSort(value)}
									>
										<SelectTrigger className="h-9 w-full sm:w-[160px]">
											<SelectValue placeholder="Sort" />
										</SelectTrigger>
										<SelectContent align="end">
											<SelectItem value="recent">Recently updated</SelectItem>
											<SelectItem value="name">Alphabetical</SelectItem>
										</SelectContent>
									</Select>
								</>
							)}
							
							{/* Refresh Button - Always show for all tabs */}
							<Button
								variant="outline"
								size="sm"
								onClick={handleRefresh}
								className="gap-2"
							>
								<Loader2
									className={cn(
										"h-4 w-4",
										(() => {
											const currentTab = tabs.find(
												(tab) => tab.id === activeTab,
											);
											if (currentTab?.type === "official") {
												return registryQuery.isFetching;
											}
											// For third-party tabs, we could add a loading state if needed
											return false;
										})(),
									)}
								/>
								Refresh
							</Button>
						</div>
					</div>

					{/* Tab Bar */}
					<div className="mt-4">
						<div className="flex items-center border-b border-slate-200 dark:border-slate-700">
							{/* Tab triggers */}
							<div className="flex items-center">
								{tabs.map((tab, index) => (
									<div key={tab.id} className="flex items-center group">
										<button
											type="button"
											onClick={() => setActiveTab(tab.id)}
											className={`py-2 text-sm font-medium border-b-2 transition-colors ${
												index === 0 ? "pl-0 pr-4" : "px-4"
											} ${
												activeTab === tab.id
													? "border-primary text-primary"
													: "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
											}`}
										>
											{tab.label}
										</button>
										{tab.closable && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													closeTab(tab.id);
												}}
												className="ml-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
											>
												<X className="h-3 w-3" />
											</button>
										)}
									</div>
								))}
							</div>

							{/* Add tab button */}
							<div className="ml-4">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
											<Plus className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start">
										{defaultMarket === "official" && (
											<DropdownMenuItem
												onClick={() =>
													addTab("MCP Market", "https://mcpmarket.cn/")
												}
											>
												MCP Market
											</DropdownMenuItem>
										)}
										{defaultMarket === "mcpmarket" && (
											<DropdownMenuItem
												onClick={() => addTab("Official MCP Registry")}
											>
												Official MCP Registry
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
					</div>
				</div>

				{/* Content based on active tab */}
				{(() => {
					const currentTab = tabs.find((tab) => tab.id === activeTab);
					return currentTab?.type === "official";
				})() ? (
					<>
						<ErrorDisplay
							title="Failed to load registry"
							error={fetchError ?? null}
							onRetry={handleRefresh}
						/>

						<ServerGrid
							servers={sortedServers}
							isInitialLoading={isInitialLoading}
							isPageLoading={isPageLoading}
							isEmpty={isEmpty}
							pagination={pagination}
							onServerPreview={handleOpenDrawer}
							onServerHide={handleHideServer}
							enableBlacklist={enableMarketBlacklist}
							onNextPage={handleNextPage}
							onPreviousPage={handlePreviousPage}
						/>
					</>
				) : (
					/* Third-party portal content */
					<div className="mt-6">
						{(() => {
							const activeTabData = tabs.find((tab) => tab.id === activeTab);
							if (activeTabData?.type === "third-party" && activeTabData.url) {
								return (
									<div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
										<iframe
											src={activeTabData.url}
											className="w-full h-[calc(100vh-300px)] min-h-[600px] rounded-xl"
											title={activeTabData.label}
											sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
										/>
									</div>
								);
							}
							return (
								<div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
									<div className="space-y-2">
										<h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
											{activeTabData?.label || "Third-Party Portal"}
										</h3>
										<p>第三方门户内容将在这里显示</p>
										<p className="text-xs text-slate-400">
											URL: {activeTabData?.url || "未配置"}
										</p>
									</div>
								</div>
							);
						})()}
					</div>
				)}

				{showScrollTop ? (
					<Button
						variant="outline"
						size="sm"
						onClick={scrollToTop}
						className="fixed bottom-16 right-14 z-30 shadow-lg"
					>
						<ArrowUp className="mr-2 h-4 w-4" />
						Top
					</Button>
				) : null}
			</div>

			{/* Transport Options Selector for Market Mode */}
			{drawerOpen && remoteOptions.length > 1 && (
				<div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
					<button
						type="button"
						className="fixed inset-0 bg-black/50"
						onClick={() => handleDrawerChange(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								handleDrawerChange(false);
							}
						}}
						aria-label="Close transport selector"
					/>
					<div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-slate-800">
						<h3 className="text-lg font-semibold mb-4">
							Select Transport Option
						</h3>
						<div className="space-y-2">
							{remoteOptions.map((option) => (
								<button
									type="button"
									key={option.id}
									onClick={() => {
										setSelectedTransportId(option.id);
										handleDrawerChange(false);
									}}
									className={`w-full text-left p-3 rounded-lg border transition-colors ${
										selectedTransportId === option.id
											? "border-primary bg-primary/5"
											: "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
									}`}
								>
									<div className="font-medium">{option.label}</div>
									<div className="text-sm text-slate-500 dark:text-slate-400">
										{option.source === "remote"
											? "Remote endpoint"
											: "Package installation"}
									</div>
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			<ServerInstallManualForm
				ref={formRef}
				isOpen={drawerOpen}
				onClose={() => handleDrawerChange(false)}
				onSubmit={() => {}} // Not used in market mode
				mode="market"
				initialDraft={initialDraft}
				onPreview={handlePreview}
				onImport={handleImport}
			/>

			{/* Install pipeline drawer for preview and import */}
			<ServerInstallDrawer
				pipeline={installPipeline}
				onBack={() => {
					// Close preview drawer and return to configuration form
					installPipeline.close();
					setDrawerOpen(true);
				}}
			/>
		</>
	);
}
