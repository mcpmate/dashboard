import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ExternalLink, EyeOff, Loader2, Plug } from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { ErrorDisplay } from "../../components/error-display";
import { Pagination } from "../../components/pagination";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../../components/ui/drawer";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { useCursorPagination } from "../../hooks/use-cursor-pagination";
import { serversApi } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import { fetchRegistryServers, getOfficialMeta } from "../../lib/registry";
import { useAppStore } from "../../lib/store";
import type {
	RegistryPackage,
	RegistryServerEntry,
	RegistryTransportHeader,
} from "../../lib/types";
import { cn, formatRelativeTime, truncate } from "../../lib/utils";

interface MarketCardProps {
	server: RegistryServerEntry;
	onPreview: (server: RegistryServerEntry) => void;
	onHide: (server: RegistryServerEntry) => void;
}

type SortOption = "recent" | "name";

function useDebouncedValue<T>(value: T, delay = 300) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(handle);
	}, [value, delay]);
	return debounced;
}

function getRemoteTypeLabel(remoteType: string) {
	const normalized = remoteType.toLowerCase();
	switch (normalized) {
		case "sse":
			return "SSE";
		case "streamable-http":
		case "streamable_http":
			return "HTTP";
		case "stdio":
			return "Stdio";
		default:
			return remoteType;
	}
}

function normalizeRemoteKind(value?: string | null): string | null {
	if (!value) return null;
	const lower = value.toLowerCase();
	if (lower === "sse") return "sse";
	if (lower === "streamable-http" || lower === "streamable_http")
		return "streamable_http";
	if (lower === "stdio") return "stdio";
	return null;
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

function slugifyForConfig(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "registry-server";
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

function parseArgsInput(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.map((value) => value.trim())
		.filter(Boolean);
}

interface SerializedConfig {
	name: string;
	kind: string;
	command: string | null;
	args: string[] | null;
	env: Record<string, string> | null;
	url: string | null;
}

function formatIsoDate(value?: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function buildPackageLaunchSuggestion(
	pkg?: RegistryPackage | null,
): { command: string; args: string[] } | null {
	if (!pkg) return null;
	const identifier = (pkg.identifier ?? "").trim();
	if (!identifier) return null;
	const registryType = (pkg.registryType ?? "").toLowerCase();
	const cleanedVersion = (pkg.version ?? "").replace(/^v/i, "").trim();
	let spec = identifier;
	if (cleanedVersion && !identifier.endsWith(`@${cleanedVersion}`)) {
		spec = `${identifier}@${cleanedVersion}`;
	}
	if (
		registryType === "pip" ||
		registryType === "pypi" ||
		registryType === "python"
	) {
		const pepSpec = cleanedVersion
			? `${identifier}==${cleanedVersion}`
			: identifier;
		return { command: "uvx", args: [pepSpec] };
	}
	if (registryType === "bun" || registryType === "bunx") {
		return { command: "bunx", args: ["-y", spec] };
	}
	if (registryType === "oci") {
		return null;
	}
	return { command: "npx", args: ["-y", spec] };
}

function buildDraftFromOption(
	option: RemoteOption,
	fallbackName: string,
	previousEnv?: Record<string, string> | null,
): DraftConfig {
	const descriptors =
		option.source === "package"
			? (option.envVars ?? [])
			: (option.headers ?? []);
	const env: Record<string, string> = {};
	descriptors.forEach((descriptor) => {
		const prior = previousEnv?.[descriptor.name];
		env[descriptor.name] = typeof prior === "string" ? prior : "";
	});

	if (option.source === "package") {
		const suggestion = buildPackageLaunchSuggestion(option.packageMeta);
		return {
			name: fallbackName,
			kind: option.kind,
			url: null,
			command: suggestion?.command ?? "",
			args: suggestion?.args ?? [],
			env,
		};
	}

	return {
		name: fallbackName,
		kind: option.kind,
		url: option.url ?? "",
		command: "",
		args: [],
		env,
	};
}

function serializeConfig(
	draft: DraftConfig,
	fallbackName: string,
): SerializedConfig {
	const name = (draft.name ?? "").trim() || fallbackName;
	const kind = draft.kind;
	const envEntries = Object.entries(draft.env ?? {}).flatMap(([key, value]) => {
		if (value == null) return [] as Array<[string, string]>;
		const trimmed = value.toString().trim();
		return trimmed.length > 0
			? ([[key, trimmed]] as Array<[string, string]>)
			: [];
	});
	const env = envEntries.length ? Object.fromEntries(envEntries) : null;
	const args = draft.args
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	const commandValue = draft.command?.trim() ?? "";
	const urlValue = draft.url?.toString().trim() ?? "";

	return {
		name,
		kind,
		command: kind === "stdio" ? (commandValue ? commandValue : null) : null,
		args: kind === "stdio" ? (args.length ? args : null) : null,
		env,
		url: kind === "stdio" ? null : urlValue ? urlValue : null,
	};
}

function normalizeConfigFromJson(
	value: unknown,
	fallbackName: string,
	fallbackKind: string,
	descriptorKeys: string[],
): DraftConfig {
	const raw =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
	const kindCandidate = typeof raw.kind === "string" ? raw.kind : fallbackKind;
	const normalizedKind = normalizeRemoteKind(kindCandidate) ?? kindCandidate;
	const urlCandidate =
		typeof raw.url === "string"
			? raw.url
			: typeof raw.endpoint === "string"
				? raw.endpoint
				: "";
	let args: string[] = [];
	if (Array.isArray(raw.args)) {
		args = raw.args.map((item) => String(item).trim()).filter(Boolean);
	} else if (typeof raw.args === "string") {
		args = parseArgsInput(raw.args);
	}
	const env: Record<string, string> = {};
	if (raw.env && typeof raw.env === "object") {
		Object.entries(raw.env as Record<string, unknown>).forEach(
			([key, value]) => {
				if (value == null) return;
				const stringValue = typeof value === "string" ? value : String(value);
				env[key] = stringValue;
			},
		);
	}
	descriptorKeys.forEach((key) => {
		if (!(key in env)) {
			env[key] = "";
		}
	});
	const draft: DraftConfig = {
		name: rawName || fallbackName,
		kind: normalizedKind,
		url: urlCandidate,
		command: typeof raw.command === "string" ? raw.command : "",
		args,
		env,
	};
	if (draft.kind === "stdio") {
		draft.url = null;
	}
	return draft;
}

function formatArgsMultiline(args: string[]): string {
	return args
		.map((value) => value.trim())
		.filter(Boolean)
		.join("\n");
}

function MarketCard({ server, onPreview, onHide }: MarketCardProps) {
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
				<div className="grid grid-cols-[1fr_auto] gap-3 items-start">
					<div className="flex items-start gap-3 min-w-0">
						<Avatar className="h-12 w-12 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-lg font-semibold">
							<AvatarFallback>
								{displayName.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<div className="flex-1 space-y-2 min-w-0">
							<CardTitle
								className="text-lg font-semibold leading-tight truncate"
								title={displayName}
							>
								{displayName}
							</CardTitle>
							{/* 版本和更新时间行 */}
							<div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
								<span>{`Version ${server.version}`}</span>
								{relativeTimestamp ? (
									<span>Updated {relativeTimestamp}</span>
								) : null}
							</div>
							{/* 描述行 */}
							<div className="h-15 flex items-start">
								<CardDescription className="text-sm text-slate-500 line-clamp-3 leading-5">
									{truncate(server.description, 320) || "N/A"}
								</CardDescription>
							</div>
						</div>
					</div>

					{/* 右上角传输类型标签 */}
					{transportBadges.length > 0 && (
						<div className="flex justify-end items-start pt-1">
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
			</CardHeader>

			<CardFooter className="flex items-center justify-between gap-2 px-4 pb-4 pt-0 mt-auto">
				<div className="flex items-center gap-3">
					<div className="w-12"></div>
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

export function MarketPage() {
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
				Boolean(registryQuery.data.metadata.next_cursor),
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
		for (const server of registryQuery.data.servers) {
			const key = getRegistryIdentity(server);
			if (blacklistIds.has(key)) {
				continue;
			}
			const official = getOfficialMeta(server);
			if (!dedup.has(key)) {
				dedup.set(key, server);
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
				dedup.set(key, server);
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
	const isPageLoading = registryQuery.isFetching && registryQuery.data;
	const isEmpty = !isInitialLoading && sortedServers.length === 0;
	const fetchError =
		registryQuery.error instanceof Error ? registryQuery.error : undefined;
	const lastErrorRef = useRef<string | null>(null);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [drawerServer, setDrawerServer] = useState<RegistryServerEntry | null>(
		null,
	);
	const [drawerOpen, setDrawerOpen] = useState(false);

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
		queryClient.removeQueries({ queryKey: ["market", "registry"] });
		registryQuery.refetch();
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

	const handleDrawerChange = (open: boolean) => {
		setDrawerOpen(open);
		if (!open) {
			setDrawerServer(null);
		}
	};

	const handleImported = () => {
		handleRefresh();
	};

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	const handleNextPage = () => {
		if (!registryQuery.data?.metadata?.next_cursor) return;
		pagination.goToNextPage(registryQuery.data.metadata.next_cursor);
		scrollToTop();
	};

	const handlePreviousPage = () => {
		pagination.goToPreviousPage();
		scrollToTop();
	};

	return (
		<>
			<div className="space-y-4">
				<div className="sticky top-0 z-10 -mx-1 rounded-b-xl bg-slate-50/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
								Market
								<sup className="ml-2 align-super text-xs font-normal text-slate-500 dark:text-slate-400">
									alpha
								</sup>
							</h2>
						</div>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
							<div className="flex-1">
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search by server name"
									className="w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-600"
								/>
							</div>
							<Select
								value={sort}
								onValueChange={(value: SortOption) => setSort(value)}
							>
								<SelectTrigger className="w-full sm:w-[160px]">
									<SelectValue placeholder="Sort" />
								</SelectTrigger>
								<SelectContent align="end">
									<SelectItem value="recent">Recently updated</SelectItem>
									<SelectItem value="name">Alphabetical</SelectItem>
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								onClick={handleRefresh}
								className="gap-2"
							>
								<Loader2
									className={cn(
										"h-4 w-4",
										registryQuery.isFetching ? "animate-spin" : "",
									)}
								/>
								Refresh
							</Button>
						</div>
					</div>
				</div>

				<ErrorDisplay
					title="Failed to load registry"
					error={fetchError ?? null}
					onRetry={handleRefresh}
				/>

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
												<div className="h-12 w-12 rounded-full bg-slate-200 animate-pulse dark:bg-slate-700" />
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

				{isEmpty ? (
					<div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
						No entries matched your filters. Try another name or clear the
						search above.
					</div>
				) : null}

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
							{sortedServers.map((server) => {
								return (
									<MarketCard
										key={`${server.name}-${server.version}`}
										server={server}
										onPreview={handleOpenDrawer}
										onHide={handleHideServer}
									/>
								);
							})}
						</div>
					</div>
				) : null}

				{!isEmpty ? (
					<Pagination
						currentPage={pagination.currentPage}
						hasPreviousPage={pagination.hasPreviousPage}
						hasNextPage={pagination.hasNextPage}
						isLoading={isInitialLoading || isPageLoading}
						itemsPerPage={pagination.itemsPerPage}
						currentPageItemCount={sortedServers.length}
						onPreviousPage={handlePreviousPage}
						onNextPage={handleNextPage}
						className="mt-6"
					/>
				) : null}

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
			<MarketPreviewDrawer
				open={drawerOpen}
				server={drawerServer}
				onOpenChange={handleDrawerChange}
				onImported={handleImported}
			/>
		</>
	);
}

interface RemoteOption {
	id: string;
	label: string;
	kind: string;
	source: "remote" | "package";
	url: string | null;
	headers?: RegistryTransportHeader[] | null;
	envVars?: RegistryTransportHeader[] | null;
	packageIdentifier?: string | null;
	packageMeta?: RegistryPackage | null;
}

interface DraftConfig {
	name: string;
	kind: string;
	url: string | null;
	command: string | null;
	args: string[];
	env: Record<string, string>;
}

interface PreviewResultItem {
	name: string;
	error?: string;
	tools?: { items?: unknown[] };
	resources?: { items?: unknown[] };
	resource_templates?: { items?: unknown[] };
	prompts?: { items?: unknown[] };
}

interface PreviewResult {
	success: boolean;
	data?: {
		items?: PreviewResultItem[];
	} | null;
	error?: unknown;
}

function MarketPreviewDrawer({
	open,
	server,
	onOpenChange,
	onImported,
}: {
	open: boolean;
	server: RegistryServerEntry | null;
	onOpenChange: (open: boolean) => void;
	onImported: () => void;
}) {
	const configNameId = useId();
	const configCommandId = useId();
	const configArgsId = useId();
	const configUrlId = useId();
	const configJsonId = useId();

	const [configView, setConfigView] = useState<"form" | "json">("form");
	const [selectedRemoteId, setSelectedRemoteId] = useState<string>("");
	const [configSourceId, setConfigSourceId] = useState<string | null>(null);
	const [configDraft, setConfigDraft] = useState<DraftConfig | null>(null);
	const [jsonText, setJsonText] = useState<string>("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
		null,
	);

	const remoteOptions = useMemo<RemoteOption[]>(() => {
		if (!server) return [];
		const options: RemoteOption[] = [];
		(server.remotes ?? []).forEach((remote, idx) => {
			const kind = normalizeRemoteKind(remote.type);
			if (!kind || !remote?.url) return;
			options.push({
				id: `${server.name}-remote-${idx}`,
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

		(server.packages ?? []).forEach((pkg, idx) => {
			const kind = normalizeRemoteKind(pkg.transport?.type);
			if (!kind) return;
			const identifier =
				pkg.identifier ?? pkg.registryType ?? `package-${idx + 1}`;
			const label = `${getRemoteTypeLabel(kind)} • ${identifier}`;
			options.push({
				id: `${server.name}-package-${idx}`,
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

		return options;
	}, [server]);

	const selectedRemote = useMemo(() => {
		return (
			remoteOptions.find((option) => option.id === selectedRemoteId) ?? null
		);
	}, [remoteOptions, selectedRemoteId]);

	useEffect(() => {
		if (!open) {
			setSelectedRemoteId("");
			setConfigSourceId(null);
			setConfigDraft(null);
			setJsonText("");
			setJsonError(null);
			setPreviewResult(null);
			setConfigView("form");
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (!remoteOptions.length) {
			setSelectedRemoteId("");
			return;
		}
		if (
			!selectedRemoteId ||
			!remoteOptions.some((option) => option.id === selectedRemoteId)
		) {
			setSelectedRemoteId(remoteOptions[0].id);
		}
	}, [open, remoteOptions, selectedRemoteId]);

	const descriptorList = useMemo(() => {
		if (!selectedRemote) return [] as RegistryTransportHeader[];
		return selectedRemote.source === "package"
			? (selectedRemote.envVars ?? [])
			: (selectedRemote.headers ?? []);
	}, [selectedRemote]);

	useEffect(() => {
		if (!open || !server) return;
		if (!selectedRemote) {
			setConfigDraft(null);
			setConfigSourceId(null);
			return;
		}
		if (configSourceId === selectedRemote.id && configDraft) {
			return;
		}
		const fallbackName =
			configDraft?.name?.trim() || slugifyForConfig(server.name);
		const nextDraft = buildDraftFromOption(
			selectedRemote,
			fallbackName,
			configDraft?.env ?? null,
		);
		setConfigDraft(nextDraft);
		setConfigSourceId(selectedRemote.id);
		setPreviewResult(null);
	}, [open, server, selectedRemote, configDraft, configSourceId]);

	useEffect(() => {
		if (!configDraft || !server) {
			setJsonText("");
			return;
		}
		const serialized = JSON.stringify(
			serializeConfig(configDraft, slugifyForConfig(server.name)),
			null,
			2,
		);
		setJsonText(serialized);
		setJsonError(null);
	}, [configDraft, server]);

	useEffect(() => {
		if (!configDraft || !descriptorList.length) return;
		const missing = descriptorList.filter(
			(descriptor) => !(descriptor.name in configDraft.env),
		);
		if (!missing.length) return;
		setConfigDraft((prev) => {
			if (!prev) return prev;
			const nextEnv = { ...prev.env };
			missing.forEach((descriptor) => {
				if (!(descriptor.name in nextEnv)) {
					nextEnv[descriptor.name] = "";
				}
			});
			return { ...prev, env: nextEnv };
		});
	}, [descriptorList, configDraft]);

	const missingRequired = descriptorList.filter((descriptor) => {
		const value = configDraft?.env?.[descriptor.name];
		return descriptor.isRequired && (!value || value.trim().length === 0);
	});

	const fallbackName = server
		? slugifyForConfig(server.name)
		: "registry-server";
	const normalizedConfig = configDraft
		? serializeConfig(configDraft, fallbackName)
		: null;
	const hasTransportTarget = normalizedConfig
		? normalizedConfig.kind === "stdio"
			? Boolean(normalizedConfig.command)
			: Boolean(normalizedConfig.url)
		: false;
	const canPreview = Boolean(
		normalizedConfig?.kind &&
			hasTransportTarget &&
			!jsonError &&
			missingRequired.length === 0,
	);

	const official = server ? getOfficialMeta(server) : undefined;
	const publishedAt = formatIsoDate(official?.publishedAt);
	const updatedAt = formatIsoDate(official?.updatedAt);

	const handleNameChange = (value: string) =>
		setConfigDraft((prev) => (prev ? { ...prev, name: value } : prev));
	const handleUrlChange = (value: string) =>
		setConfigDraft((prev) => (prev ? { ...prev, url: value } : prev));
	const handleCommandChange = (value: string) =>
		setConfigDraft((prev) => (prev ? { ...prev, command: value } : prev));
	const handleArgsChange = (value: string) =>
		setConfigDraft((prev) =>
			prev ? { ...prev, args: parseArgsInput(value) } : prev,
		);
	const handleEnvChange = (key: string, value: string) =>
		setConfigDraft((prev) =>
			prev ? { ...prev, env: { ...prev.env, [key]: value } } : prev,
		);

	const handleJsonChange = (value: string) => {
		setConfigView("json");
		setJsonText(value);
		if (!server) return;
		try {
			const descriptorKeys = descriptorList.map(
				(descriptor) => descriptor.name,
			);
			const normalized = normalizeConfigFromJson(
				JSON.parse(value),
				fallbackName,
				configDraft?.kind ?? selectedRemote?.kind ?? "streamable_http",
				descriptorKeys,
			);
			setConfigDraft(normalized);
			setJsonError(null);
		} catch (error) {
			setJsonError(
				error instanceof Error ? error.message : "Invalid configuration JSON",
			);
		}
	};

	const buildConfigPayload = () => {
		if (!server || !configDraft) return null;
		return serializeConfig(configDraft, slugifyForConfig(server.name));
	};

	const previewMutation = useMutation({
		mutationFn: async () => {
			const config = buildConfigPayload();
			if (!config) {
				throw new Error("Configuration incomplete");
			}
			setPreviewResult(null);
			return serversApi.previewServers({
				servers: [config],
				include_details: true,
				timeout_ms: 5000,
			});
		},
		onSuccess: (res: PreviewResult) => {
			setPreviewResult(res);
			notifySuccess("Preview generated", "Capability snapshot ready.");
		},
		onError: (err) => {
			notifyError(
				"Preview failed",
				err instanceof Error ? err.message : String(err),
			);
		},
	});

	const importMutation = useMutation({
		mutationFn: async () => {
			const config = buildConfigPayload();
			if (!config) {
				throw new Error("Configuration incomplete");
			}
			const payload = {
				mcpServers: {
					[config.name]: {
						type: config.kind,
						command: config.command ?? null,
						args: config.args ?? null,
						url: config.url ?? null,
						env: config.env ?? null,
						registry_server_id: official?.serverId ?? null,
					},
				},
			};
			return serversApi.importServers(payload);
		},
		onSuccess: () => {
			notifySuccess("Server imported", "Configuration added to MCPMate.");
			onImported();
			onOpenChange(false);
		},
		onError: (err) => {
			notifyError(
				"Import failed",
				err instanceof Error ? err.message : String(err),
			);
		},
	});

	if (!server) {
		return null;
	}

	const unsupported = !remoteOptions.length;
	const repositoryUrl = server.repository?.url;
	const websiteUrl = server.websiteUrl;
	const argsMultiline = configDraft
		? formatArgsMultiline(configDraft.args)
		: "";

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex h-full flex-col">
				<DrawerHeader className="border-b p-4 text-left space-y-2">
					<DrawerTitle className="text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
						{formatServerName(server.name)}
						{server.version ? (
							<sup className="ml-2 align-super text-xs font-normal text-slate-500 dark:text-slate-400">
								v{server.version}
							</sup>
						) : null}
					</DrawerTitle>
					<DrawerDescription className="text-left text-sm leading-relaxed text-slate-600 dark:text-slate-300">
						{server.description || "No description provided by the registry."}
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex flex-1 flex-col overflow-hidden">
					<div className="flex h-full flex-col">
						<div className="p-4">
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="server-info">
									<AccordionTrigger className="text-sm font-medium">
										Server Information
									</AccordionTrigger>
									<AccordionContent>
										<div className="space-y-4 pr-1">
											<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
												<dl className="grid gap-3 text-sm md:grid-cols-2">
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Server ID
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{official?.serverId ?? "—"}
														</dd>
													</div>
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Status
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{server.status ?? "—"}
														</dd>
													</div>
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Published
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{publishedAt
																? `${publishedAt} (${formatRelativeTime(official!.publishedAt)})`
																: "—"}
														</dd>
													</div>
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Updated
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{updatedAt
																? `${updatedAt} (${formatRelativeTime(official!.updatedAt ?? official!.publishedAt)})`
																: "—"}
														</dd>
													</div>
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Repository
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{repositoryUrl ? (
																<a
																	href={repositoryUrl}
																	target="_blank"
																	rel="noreferrer"
																	className="text-primary underline"
																>
																	Open
																</a>
															) : (
																<span>—</span>
															)}
														</dd>
													</div>
													<div>
														<dt className="font-medium text-slate-600 dark:text-slate-300">
															Website
														</dt>
														<dd className="text-slate-900 dark:text-slate-100">
															{websiteUrl ? (
																<a
																	href={websiteUrl}
																	target="_blank"
																	rel="noreferrer"
																	className="text-primary underline"
																>
																	Open
																</a>
															) : (
																<span>—</span>
															)}
														</dd>
													</div>
												</dl>
											</section>
											{server.remotes?.length ? (
												<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
													<h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
														Remotes
													</h4>
													<ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
														{server.remotes.map((remote, idx) => (
															<li
																key={remote.url ?? `${remote.type}-${idx}`}
																className="space-y-1"
															>
																<div className="flex items-center justify-between gap-2">
																	<span className="font-medium text-slate-700 dark:text-slate-100">
																		{getRemoteTypeLabel(remote.type ?? "")}
																	</span>
																	<span className="truncate text-xs text-primary">
																		{remote.url ?? "—"}
																	</span>
																</div>
																{remote.headers?.length ? (
																	<div className="text-xs text-slate-500 dark:text-slate-400">
																		Requires {remote.headers.length} header(s)
																	</div>
																) : null}
															</li>
														))}
													</ul>
												</section>
											) : null}
											{server.packages?.length ? (
												<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
													<h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
														Packages
													</h4>
													<ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
														{server.packages.map((pkg, idx) => (
															<li
																key={`${pkg.identifier ?? "pkg"}-${idx}`}
																className="space-y-1"
															>
																<div className="flex flex-wrap items-center justify-between gap-2">
																	<span className="font-medium text-slate-700 dark:text-slate-100">
																		{pkg.identifier ?? "Unnamed package"}
																	</span>
																	<span className="text-xs text-slate-500 dark:text-slate-400">
																		{[pkg.registryType, pkg.version]
																			.filter(Boolean)
																			.join(" • ") || "—"}
																	</span>
																</div>
																{pkg.transport?.type ? (
																	<div className="text-xs text-slate-500 dark:text-slate-400">
																		Transport:{" "}
																		{getRemoteTypeLabel(pkg.transport.type)}
																	</div>
																) : null}
															</li>
														))}
													</ul>
												</section>
											) : null}
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</div>

						<div className="flex-1 overflow-auto px-6 pb-6">
							{!unsupported ? (
								<div className="space-y-4">
									{remoteOptions.length > 1 ? (
										<div className="space-y-2">
											<Label
												htmlFor="remote-select"
												className="text-sm font-medium"
											>
												Transport Option
											</Label>
											<Select
												value={selectedRemoteId}
												onValueChange={setSelectedRemoteId}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select transport option" />
												</SelectTrigger>
												<SelectContent>
													{remoteOptions.map((option) => (
														<SelectItem key={option.id} value={option.id}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									) : null}

									{configDraft ? (
										<div className="space-y-4">
											<div className="flex items-center justify-between">
												<Label className="text-sm font-medium">
													Configuration
												</Label>
												<div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
													<button
														type="button"
														onClick={() => setConfigView("form")}
														className={cn(
															"rounded px-3 py-1 text-xs font-medium transition-colors",
															configView === "form"
																? "bg-primary text-primary-foreground"
																: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
														)}
													>
														Form
													</button>
													<button
														type="button"
														onClick={() => setConfigView("json")}
														className={cn(
															"rounded px-3 py-1 text-xs font-medium transition-colors",
															configView === "json"
																? "bg-primary text-primary-foreground"
																: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
														)}
													>
														JSON
													</button>
												</div>
											</div>

											{configView === "form" ? (
												<div className="space-y-4">
													<div className="space-y-2">
														<Label htmlFor={configNameId}>Server Name</Label>
														<Input
															id={configNameId}
															value={configDraft.name}
															onChange={(e) => handleNameChange(e.target.value)}
															placeholder="Enter server name"
														/>
													</div>

													{configDraft.kind === "stdio" ? (
														<>
															<div className="space-y-2">
																<Label htmlFor={configCommandId}>Command</Label>
																<Input
																	id={configCommandId}
																	value={configDraft.command ?? ""}
																	onChange={(e) =>
																		handleCommandChange(e.target.value)
																	}
																	placeholder="Command to execute"
																/>
															</div>
															<div className="space-y-2">
																<Label htmlFor={configArgsId}>Arguments</Label>
																<Textarea
																	id={configArgsId}
																	value={argsMultiline}
																	onChange={(e) =>
																		handleArgsChange(e.target.value)
																	}
																	placeholder="One argument per line"
																	rows={4}
																/>
															</div>
														</>
													) : (
														<div className="space-y-2">
															<Label htmlFor={configUrlId}>URL</Label>
															<Input
																id={configUrlId}
																value={configDraft.url ?? ""}
																onChange={(e) =>
																	handleUrlChange(e.target.value)
																}
																placeholder="Server URL"
															/>
														</div>
													)}

													{descriptorList.length > 0 ? (
														<div className="space-y-4">
															<Label className="text-sm font-medium">
																{selectedRemote?.source === "package"
																	? "Environment Variables"
																	: "Headers"}
															</Label>
															<div className="space-y-4">
																{descriptorList.map((descriptor) => (
																	<div
																		key={descriptor.name}
																		className="space-y-2"
																	>
																		<Label
																			htmlFor={`env-${descriptor.name}`}
																			className="text-sm"
																		>
																			{descriptor.name}
																			{descriptor.isRequired ? (
																				<span className="ml-1 text-red-500">
																					*
																				</span>
																			) : null}
																		</Label>
																		<Input
																			id={`env-${descriptor.name}`}
																			value={
																				configDraft.env[descriptor.name] ?? ""
																			}
																			onChange={(e) =>
																				handleEnvChange(
																					descriptor.name,
																					e.target.value,
																				)
																			}
																			placeholder={
																				descriptor.description ||
																				`Enter ${descriptor.name}`
																			}
																		/>
																	</div>
																))}
															</div>
														</div>
													) : null}

													{missingRequired.length ? (
														<Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
															<AlertTitle>Missing required fields</AlertTitle>
															<AlertDescription>
																Provide values for{" "}
																{missingRequired
																	.map((item) => item.name)
																	.join(", ")}
															</AlertDescription>
														</Alert>
													) : null}
												</div>
											) : (
												<div className="space-y-2">
													<Label htmlFor={configJsonId}>
														Configuration JSON
													</Label>
													<Textarea
														id={configJsonId}
														value={jsonText}
														onChange={(e) => handleJsonChange(e.target.value)}
														rows={12}
														className="font-mono text-sm"
													/>
													{jsonError ? (
														<div className="text-sm text-red-500">
															{jsonError}
														</div>
													) : null}
												</div>
											)}

											{previewResult ? (
												<div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
													{previewResult.success &&
													previewResult.data?.items?.length ? (
														<div className="space-y-2">
															{previewResult.data.items.map(
																(item: PreviewResultItem) => (
																	<div
																		key={item.name}
																		className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700"
																	>
																		<div className="font-medium text-slate-700 dark:text-slate-200">
																			{item.name}
																			{item.error ? " (error)" : ""}
																		</div>
																		{item.error ? (
																			<div className="text-red-500">
																				{item.error}
																			</div>
																		) : (
																			<div className="text-slate-500">
																				Tools: {item.tools?.items?.length ?? 0}{" "}
																				• Resources:{" "}
																				{item.resources?.items?.length ?? 0} •
																				Templates:{" "}
																				{item.resource_templates?.items
																					?.length ?? 0}{" "}
																				• Prompts:{" "}
																				{item.prompts?.items?.length ?? 0}
																			</div>
																		)}
																	</div>
																),
															)}
														</div>
													) : (
														<div className="text-xs text-slate-500">
															Preview returned no capabilities.
														</div>
													)}
												</div>
											) : null}
										</div>
									) : (
										<div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
											Select a transport option to configure.
										</div>
									)}
								</div>
							) : (
								<div className="rounded-lg border border-dashed border-slate-300 bg-slate-100 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
									<div className="text-lg font-medium text-slate-700 dark:text-slate-200">
										Configuration Not Supported
									</div>
									<div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
										This server entry doesn't provide compatible transport
										options for preview and import.
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
				<DrawerFooter className="border-t px-6 py-4">
					<div className="flex items-center justify-end gap-3">
						<Button
							variant="outline"
							onClick={() => previewMutation.mutate()}
							disabled={!canPreview || previewMutation.isPending || unsupported}
							className="gap-2"
						>
							{previewMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							Preview capabilities
						</Button>
						<Button
							onClick={() => importMutation.mutate()}
							disabled={!canPreview || importMutation.isPending || unsupported}
							className="gap-2"
						>
							{importMutation.isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							Import server
						</Button>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
