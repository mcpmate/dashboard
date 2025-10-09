import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorDisplay } from "../../components/error-display";
import { ServerInstallWizard } from "../../components/uniimport/server-install-wizard";
import type { ServerInstallManualFormHandle } from "../../components/uniimport/types";
import { Button } from "../../components/ui/button";
import { useServerInstallPipeline } from "../../hooks/use-server-install-pipeline";
import { notifyError, notifyInfo } from "../../lib/notify";
import { parseJsonDrafts, parseTomlDrafts } from "../../lib/install-normalizer";
import { useAppStore } from "../../lib/store";
import type { RegistryServerEntry } from "../../lib/types";
import {
	useDebouncedValue,
	getRegistryIdentity,
	formatServerName,
	slugifyForConfig,
	normalizeRemoteKind,
	getRemoteTypeLabel,
	buildDraftFromRemoteOption,
} from "./utils";
import { MarketIframe } from "./market-iframe";
import { MarketSearch } from "./market-search";
import { MarketTabs } from "./market-tabs";
import { ServerGrid } from "./server-grid";
import { useMarketData, useMarketTabs } from "./hooks";
import type { SortOption } from "./types";
import type { ServerInstallDraft } from "../../hooks/use-server-install-pipeline";

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

export function MarketPage() {
	const { t } = useTranslation();
	// Use custom hooks for data and tab management
	const {
		tabs,
		activeTab,
		setActiveTab,
		availablePortals,
		addPortalTab,
		addOfficialTab,
		closeTab,
		portalMap,
	} = useMarketTabs(t);

	const currentTab = useMemo(
		() => tabs.find((tab) => tab.id === activeTab),
		[tabs, activeTab],
	);
	const currentPortal = useMemo(() => {
		if (!currentTab?.portalId) return undefined;
		return portalMap[currentTab.portalId];
	}, [currentTab, portalMap]);
	const isOfficialTab = currentTab?.type === "official";

	// Search and sort state (only for official tab)
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortOption>("recent");
	const debouncedSearch = useDebouncedValue(search.trim(), 300);

	// Get market data using custom hook
	const {
		servers,
		isInitialLoading,
		isPageLoading,
		isEmpty,
		fetchError,
		pagination,
		onNextPage,
		onPreviousPage,
		onRefresh,
	} = useMarketData(debouncedSearch, sort);

	// Get app store values
	const addToMarketBlacklist = useAppStore(
		(state) => state.addToMarketBlacklist,
	);
	const enableMarketBlacklist = useAppStore(
		(state) => state.dashboardSettings.enableMarketBlacklist,
	);

	// UI state
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
	const formRef = useRef<ServerInstallManualFormHandle>(null);
	const pendingImportRef = useRef<{
		text: string;
		fileName: string;
		sourceUrl: string;
		parsedDraft?: ServerInstallDraft | null;
		portalId?: string;
		adapterId?: string;
	} | null>(null);
	const [pendingImportTick, setPendingImportTick] = useState(0);
	const [portalRefreshMap, setPortalRefreshMap] = useState<
		Record<string, number>
	>({});

	const portalRefreshKey = currentPortal
		? (portalRefreshMap[currentPortal.id] ?? 0)
		: 0;

	const handleRefreshClick = useCallback(() => {
		if (isOfficialTab) {
			onRefresh();
			return;
		}
		if (currentPortal) {
			setPortalRefreshMap((prev) => ({
				...prev,
				[currentPortal.id]: (prev[currentPortal.id] ?? 0) + 1,
			}));
		}
	}, [isOfficialTab, onRefresh, currentPortal]);

	// Event handlers
	const handleHideServer = (entry: RegistryServerEntry) => {
		const identity = getRegistryIdentity(entry);
		const label = formatServerName(entry.name);
		addToMarketBlacklist({
			serverId: identity,
			label,
			hiddenAt: Date.now(),
		});
		notifyInfo(
			t("market.notifications.serverHidden"),
			`${label} will be excluded from Market.`,
		);
	};

	const handleOpenDrawer = (entry: RegistryServerEntry) => {
		setDrawerServer(entry);
		setDrawerOpen(true);
	};

	const handleDrawerChange = useCallback(
		(open: boolean) => {
			setDrawerOpen(open);
			if (!open) {
				setDrawerServer(null);
			}
		},
		[notifyError, portalMap],
	);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	// Install pipeline for preview and import
	const installPipeline = useServerInstallPipeline({
		onImported: () => {
			// Refresh the market data after successful import
			// Close both drawers and return to market page
			setDrawerOpen(false);
			setDrawerServer(null);
		},
	});

	// Build transport options for official registry entries
	useEffect(() => {
		if (!drawerServer) {
			setRemoteOptions([]);
			setSelectedRemote(null);
			return;
		}

		const options: RemoteOption[] = [];

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

		(drawerServer.packages ?? []).forEach((pkg, idx) => {
			const kind = normalizeRemoteKind(pkg.transport?.type);
			if (!kind) return;
			const identifier =
				pkg.identifier ?? pkg.registryType ?? `package-${idx + 1}`;
			options.push({
				id: `${drawerServer.name}-package-${idx}`,
				label: `${getRemoteTypeLabel(kind)} • ${identifier}`,
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
		if (options.length > 0) {
			const defaultOption = options[0];
			setSelectedRemote(defaultOption);
			setSelectedTransportId(defaultOption.id);
		} else {
			setSelectedRemote(null);
			setSelectedTransportId("");
		}
	}, [drawerServer]);

	useEffect(() => {
		if (!selectedTransportId || !remoteOptions.length) return;
		const option = remoteOptions.find((opt) => opt.id === selectedTransportId);
		if (option) setSelectedRemote(option);
	}, [selectedTransportId, remoteOptions]);

	const initialDraft = useMemo<ServerInstallDraft | undefined>(() => {
		if (!selectedRemote || !drawerServer) return undefined;
		const fallbackName = slugifyForConfig(drawerServer.name);
		const draft = buildDraftFromRemoteOption(selectedRemote, fallbackName);
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

		return draftWithMeta;
	}, [selectedRemote, drawerServer]);

	// Receive configuration snippets from third-party market iframes
	useEffect(() => {
		const handleMarketImportMessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || typeof data !== "object") return;
			if (data.type !== "mcpmate-market-import") return;
			const rawText = String(data.payload?.text ?? "").trim();
			if (!rawText) {
				notifyError("Import failed", "Received empty configuration snippet.");
				return;
			}

			const portalId =
				typeof data.payload?.portalId === "string" &&
				data.payload.portalId.trim()
					? data.payload.portalId.trim()
					: undefined;
			const adapterFromMessage =
				typeof data.payload?.adapter === "string" && data.payload.adapter.trim()
					? data.payload.adapter.trim()
					: undefined;
			const portalMeta = portalId ? portalMap[portalId] : undefined;

			const translateProxiedUrl = (value: string): string => {
				if (!portalMeta) return value;
				try {
					const baseWithSlash = portalMeta.proxyPath.endsWith("/")
						? portalMeta.proxyPath
						: `${portalMeta.proxyPath}/`;
					const baseWithoutSlash = baseWithSlash.slice(0, -1);
					const localUrl = new URL(value, window.location.origin);
					const localPath = localUrl.pathname;
					let remainder: string | null = null;
					if (localPath === baseWithoutSlash) {
						remainder = "/";
					} else if (localPath.startsWith(baseWithSlash)) {
						const raw = localPath.slice(baseWithSlash.length);
						remainder = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : "/";
					}
					if (remainder === null) {
						return value;
					}
					const remote = new URL(remainder, portalMeta.remoteOrigin);
					remote.search = localUrl.search;
					remote.hash = localUrl.hash;
					return remote.toString();
				} catch (_error) {
					return value;
				}
			};

			setDrawerServer(null);
			setRemoteOptions([]);
			setSelectedRemote(null);
			setSelectedTransportId("");
			setDrawerOpen(true);

			const format =
				typeof data.payload?.format === "string"
					? data.payload.format
					: "unknown";
			const fileName =
				format === "json"
					? "snippet.json"
					: format === "toml"
						? "snippet.toml"
						: "snippet.txt";

			let parsedDraft: ServerInstallDraft | null = null;
			try {
				if (format === "json") {
					parsedDraft = parseJsonDrafts(rawText)[0] ?? null;
				} else if (format === "toml") {
					parsedDraft = parseTomlDrafts(rawText)[0] ?? null;
				} else {
					parsedDraft =
						parseJsonDrafts(rawText)[0] ?? parseTomlDrafts(rawText)[0] ?? null;
				}
			} catch {
				parsedDraft = null;
			}

			const rawSource =
				typeof data.payload?.source === "string"
					? data.payload.source
					: window.location.href;
			const sourceUrl = translateProxiedUrl(rawSource);

			pendingImportRef.current = {
				text: rawText,
				fileName,
				sourceUrl,
				parsedDraft,
				portalId,
				adapterId: adapterFromMessage,
			};
		};

		window.addEventListener("message", handleMarketImportMessage);
		return () =>
			window.removeEventListener("message", handleMarketImportMessage);
	}, []);

	useEffect(() => {
		if (!drawerOpen) return;
		const snippet = pendingImportRef.current;
		if (!snippet) return;
		const ingest = formRef.current?.ingest;
		if (typeof ingest !== "function") return;
		pendingImportRef.current = null;

		void (async () => {
			try {
				await ingest({ text: snippet.text, fileName: snippet.fileName });
				const currentDraft = formRef.current?.getCurrentDraft();
				if (currentDraft) {
					const draftMeta = { ...(snippet.parsedDraft?.meta ?? {}) };
					const mergedMeta: ServerInstallDraft["meta"] = {
						...draftMeta,
						...(currentDraft.meta ?? {}),
					};
					const mergedRepo = {
						...(draftMeta.repository ?? {}),
						...(currentDraft.meta?.repository ?? {}),
					};
					if (!mergedMeta.description) {
						mergedMeta.description = `Imported from ${snippet.sourceUrl}`;
					}
					if (!mergedMeta.websiteUrl && draftMeta.websiteUrl) {
						mergedMeta.websiteUrl = draftMeta.websiteUrl;
					}
					if (!mergedRepo.url && draftMeta.repository?.url) {
						mergedRepo.url = draftMeta.repository.url;
					}
					if (Object.keys(mergedRepo).length) {
						mergedMeta.repository = mergedRepo;
					}
					formRef.current?.loadDraft({ ...currentDraft, meta: mergedMeta });
				}
				notifyInfo(
					t("market.notifications.configurationDetected"),
					t("market.notifications.reviewImportedSnippet"),
				);
			} catch (error) {
				pendingImportRef.current = { ...snippet };
				setPendingImportTick((tick) => tick + 1);
				notifyError(
					t("market.notifications.importFailed"),
					String(
						error instanceof Error ? error.message : (error ?? "Unknown error"),
					),
				);
			}
		})();
	}, [drawerOpen, pendingImportTick]);

	// (preview/import handlers are now managed inside ServerInstallWizard via shared pipeline)

	// Scroll to top effect
	useEffect(() => {
		const handler = () => {
			setShowScrollTop(window.scrollY > 400);
		};
		handler();
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	return (
		<>
			<div className="space-y-4">
				<div className="sticky top-0 z-10 -mx-1 rounded-b-xl px-1 backdrop-blur">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
								{t("market.title")}
								<sup className="ml-2 align-super text-xs font-normal text-slate-500 dark:text-slate-400">
									{t("market.alpha")}
								</sup>
							</h2>
						</div>

						{/* Search, Sort, and Refresh Controls */}
						{isOfficialTab ? (
							<MarketSearch
								search={search}
								onSearchChange={setSearch}
								sort={sort}
								onSortChange={setSort}
								onRefresh={handleRefreshClick}
								isLoading={isPageLoading}
							/>
						) : (
							<div className="flex justify-end">
								<Button
									variant="outline"
									size="sm"
									onClick={handleRefreshClick}
									className="gap-2"
									disabled={isPageLoading}
								>
									<Loader2
										className={`h-4 w-4 ${isPageLoading ? "animate-spin" : ""}`}
									/>
									{t("market.buttons.refresh")}
								</Button>
							</div>
						)}
					</div>

					{/* Tab Bar */}
					<MarketTabs
						tabs={tabs}
						activeTab={activeTab}
						onTabChange={setActiveTab}
						onCloseTab={closeTab}
						onAddOfficial={addOfficialTab}
						availablePortals={availablePortals}
						onAddPortal={addPortalTab}
					/>
				</div>

				{/* Content based on active tab */}
				{isOfficialTab ? (
					<>
						<ErrorDisplay
							title={t("market.errors.failedToLoadRegistry")}
							error={fetchError ?? null}
							onRetry={handleRefreshClick}
						/>

						<ServerGrid
							servers={servers}
							isInitialLoading={isInitialLoading}
							isPageLoading={isPageLoading}
							isEmpty={isEmpty}
							pagination={pagination}
							onServerPreview={handleOpenDrawer}
							onServerHide={handleHideServer}
							enableBlacklist={enableMarketBlacklist}
							onNextPage={onNextPage}
							onPreviousPage={onPreviousPage}
						/>
					</>
				) : (
					/* Third-party portal content */
					<div className="mt-6 flex flex-col">
						{currentPortal ? (
							<MarketIframe
								key={`${currentPortal.id}-${portalRefreshKey}`}
								url={currentTab?.url ?? currentPortal.proxyPath}
								title={currentPortal.label}
								portalId={currentPortal.id}
								proxyPath={currentPortal.proxyPath}
								refreshKey={portalRefreshKey}
							/>
						) : (
							<div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
								<div className="space-y-2">
									<h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
										{currentTab?.label || t("market.thirdParty.portal")}
									</h3>
									<p>{t("market.thirdParty.contentWillDisplay")}</p>
									<p className="text-xs text-slate-400">
										URL:{" "}
										{currentTab?.url || t("market.thirdParty.urlNotConfigured")}
									</p>
								</div>
							</div>
						)}
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
						{t("market.buttons.top")}
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
							{t("market.transport.selectOption")}
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
											? t("market.transport.remoteEndpoint")
											: t("market.transport.packageInstallation")}
									</div>
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			<ServerInstallWizard
				ref={formRef}
				isOpen={drawerOpen}
				onClose={() => handleDrawerChange(false)}
				mode="import"
				initialDraft={initialDraft}
				allowProgrammaticIngest
				pipeline={installPipeline}
			/>
		</>
	);
}
