import { Moon, RotateCcw, Sun } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Segment, type SegmentOption } from "../../components/ui/segment";
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
import {
	type ClientBackupStrategy,
	type ClientDefaultMode,
	type DashboardAppMode,
	type DashboardDefaultView,
	type DashboardLanguage,
	type DashboardSettings,
	type MarketBlacklistEntry,
	type DefaultMarket,
	useAppStore,
} from "../../lib/store";
import type { OpenSourceDocument } from "../../types/open-source";
import { AboutLicensesSection } from "./about-licenses-section";
import { mergePortalOverrides } from "../market/portal-registry";

// Options for Segment components
const THEME_OPTIONS: SegmentOption[] = [
	{ value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
	{ value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
];

const DEFAULT_VIEW_OPTIONS: SegmentOption[] = [
	{ value: "list", label: "List" },
	{ value: "grid", label: "Grid" },
];

const APPLICATION_MODE_OPTIONS: SegmentOption[] = [
	{ value: "express", label: "Express" },
	{ value: "expert", label: "Expert" },
];

const CLIENT_MODE_OPTIONS: SegmentOption[] = [
	{ value: "hosted", label: "Hosted" },
	{ value: "transparent", label: "Transparent" },
];

const BACKUP_STRATEGY_OPTIONS: SegmentOption[] = [
	{ value: "keep_n", label: "Nub." },
	{ value: "keep_last", label: "Last" },
	{ value: "none", label: "None" },
];

export function SettingsPage() {
	const languageId = useId();
	const backupLimitId = useId();

	const theme = useAppStore((state) => state.theme);
	const setTheme = useAppStore((state) => state.setTheme);
	const dashboardSettings = useAppStore((state) => state.dashboardSettings);
	const setDashboardSetting = useAppStore((state) => state.setDashboardSetting);
	const removeFromMarketBlacklist = useAppStore(
		(state) => state.removeFromMarketBlacklist,
	);
	const [licenseDocument, setLicenseDocument] = useState<OpenSourceDocument | null>(null);
	const [licenseLoaded, setLicenseLoaded] = useState(false);

	const tabTriggerClass =
		"justify-start px-3 py-2 text-left text-sm font-medium text-slate-600 data-[state=active]:text-emerald-700 dark:text-slate-300";

	// Build available portals list for Default Market selector
	const availablePortals = useMemo(
		() =>
			Object.values(
				mergePortalOverrides(dashboardSettings.marketPortals),
			).sort((a, b) => a.label.localeCompare(b.label)),
		[dashboardSettings.marketPortals],
	);

	useEffect(() => {
		let cancelled = false;
		const noticesUrl = `${import.meta.env.BASE_URL}open-source-notices.json`;

		const loadLicenses = async () => {
			try {
				const response = await fetch(noticesUrl, {
					cache: "no-store",
				});

				if (!response.ok) {
					return;
				}

				const data = (await response.json()) as OpenSourceDocument;
				if (
					!cancelled &&
					data &&
					Array.isArray(data.sections)
				) {
					setLicenseDocument(data);
				}
			} catch (error) {
				if (import.meta.env.DEV) {
					console.warn("[SettingsPage] Unable to load open-source notices:", error);
				}
			} finally {
				if (!cancelled) {
					setLicenseLoaded(true);
				}
			}
		};

		void loadLicenses();

		return () => {
			cancelled = true;
		};
	}, []);

	const showLicenseTab = licenseLoaded && licenseDocument !== null;

	return (
		<div className="space-y-4">
			<h2 className="text-3xl font-bold tracking-tight">Settings</h2>

			<Tabs
				defaultValue="general"
				orientation="vertical"
				className="flex flex-col gap-4 xl:flex-row xl:items-start"
			>
				<TabsList className="flex w-full flex-row flex-wrap gap-2 overflow-x-auto rounded-lg p-2 xl:w-64 xl:flex-col xl:overflow-visible xl:p-3 xl:self-start">
					<TabsTrigger value="general" className={tabTriggerClass}>
						General
					</TabsTrigger>
					<TabsTrigger value="appearance" className={tabTriggerClass}>
						Appearance
					</TabsTrigger>
					<TabsTrigger value="servers" className={tabTriggerClass}>
						Server Controls
					</TabsTrigger>
					<TabsTrigger value="clients" className={tabTriggerClass}>
						Client Defaults
					</TabsTrigger>
					<TabsTrigger value="market" className={tabTriggerClass}>
						MCP Market
					</TabsTrigger>
					<TabsTrigger value="develop" className={tabTriggerClass}>
						Developer
					</TabsTrigger>
					{showLicenseTab && (
						<TabsTrigger value="about" className={tabTriggerClass}>
							About &amp; Licenses
						</TabsTrigger>
					)}
				</TabsList>

				<div className="flex-1">
					<TabsContent value="general" className="mt-0 h-full">
						<Card className="h-full">
							<CardHeader>
								<CardTitle>General</CardTitle>
								<CardDescription>
									Baseline preferences for the main workspace views.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{/* Default View */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">Default View</h3>
										<p className="text-sm text-slate-500">
											Choose the default layout for displaying items.
										</p>
									</div>
									<div className="w-48">
										<Segment
											options={DEFAULT_VIEW_OPTIONS}
											value={dashboardSettings.defaultView}
											onValueChange={(value) =>
												setDashboardSetting(
													"defaultView",
													value as DashboardDefaultView,
												)
											}
											showDots={false}
										/>
									</div>
								</div>

								{/* Application Mode */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">
											Application Mode (WIP)
										</h3>
										<p className="text-sm text-slate-500">
											Select the interface complexity level.
										</p>
									</div>
									<div className="w-48">
										<Segment
											options={APPLICATION_MODE_OPTIONS}
											value={dashboardSettings.appMode}
											onValueChange={(value) =>
												setDashboardSetting(
													"appMode",
													value as DashboardAppMode,
												)
											}
											showDots={false}
										/>
									</div>
								</div>

								{/* Language Selection */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">
											Language <sup className="text-xs text-slate-400">WIP</sup>
										</h3>
										<p className="text-sm text-slate-500">
											Multi-language support is currently in development.
										</p>
									</div>
									<Select
										value={dashboardSettings.language}
										onValueChange={(value: DashboardLanguage) =>
											setDashboardSetting("language", value)
										}
										disabled
									>
										<SelectTrigger id={languageId} className="w-48">
											<SelectValue placeholder="Select language" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="en">English</SelectItem>
											<SelectItem value="zh-cn">简体中文</SelectItem>
											<SelectItem value="ja">日本语</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="appearance" className="mt-0 h-full">
						<Card className="h-full">
							<CardHeader>
								<CardTitle>Appearance</CardTitle>
								<CardDescription>
									Customize the look and feel of the dashboard.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<h3 className="text-base font-medium">Theme</h3>
											<p className="text-sm text-slate-500">
												Switch between light and dark mode.
											</p>
										</div>
										<div className="w-48">
											<Segment
												options={THEME_OPTIONS}
												value={theme === "system" ? "light" : theme}
												onValueChange={(value) =>
													setTheme(value as "light" | "dark")
												}
												showDots={false}
											/>
										</div>
									</div>

									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<h3 className="text-base font-medium">
												System Preference
											</h3>
											<p className="text-sm text-slate-500">
												Follow the operating system preference automatically.
											</p>
										</div>
										<Switch
											checked={theme === "system"}
											onCheckedChange={(checked) =>
												setTheme(checked ? "system" : "light")
											}
										/>
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="servers" className="mt-0 h-full">
						<Card className="h-full">
							<CardHeader>
								<CardTitle>Server Controls</CardTitle>
								<CardDescription>
									Decide how server operations propagate across clients.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-5">
								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Sync Global Start/Stop
										</h3>
										<p className="text-sm text-slate-500">
											Push global enable state to managed clients instantly.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.syncServerStateToClients}
										onCheckedChange={(checked) =>
											setDashboardSetting("syncServerStateToClients", checked)
										}
									/>
								</div>

								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Auto Add To Default Profile
										</h3>
										<p className="text-sm text-slate-500">
											Include new servers in the default profile automatically.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.autoAddServerToDefaultProfile}
										onCheckedChange={(checked) =>
											setDashboardSetting(
												"autoAddServerToDefaultProfile",
												checked,
											)
										}
									/>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="clients" className="mt-0 h-full">
						<Card className="h-full">
							<CardHeader>
								<CardTitle>Client Defaults</CardTitle>
								<CardDescription>
									Configure default rollout and backup behavior for client apps.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{/* Client Application Mode */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">
											Client Application Mode
										</h3>
										<p className="text-sm text-slate-500">
											Choose how client applications should operate by default.
										</p>
									</div>
									<div className="w-48">
										<Segment
											options={CLIENT_MODE_OPTIONS}
											value={dashboardSettings.clientDefaultMode}
											onValueChange={(value) =>
												setDashboardSetting(
													"clientDefaultMode",
													value as ClientDefaultMode,
												)
											}
											showDots={false}
										/>
									</div>
								</div>

								{/* Client Backup Strategy */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">
											Client Backup Strategy
										</h3>
										<p className="text-sm text-slate-500">
											Define how client configurations should be backed up.
										</p>
									</div>
									<div className="w-48">
										<Segment
											options={BACKUP_STRATEGY_OPTIONS}
											value={dashboardSettings.clientBackupStrategy}
											onValueChange={(value) =>
												setDashboardSetting(
													"clientBackupStrategy",
													value as ClientBackupStrategy,
												)
											}
											showDots={false}
										/>
									</div>
								</div>

								{/* Maximum Backup Copies */}
								<div className="flex items-center justify-between gap-4">
									<div className="space-y-0.5">
										<h3 className="text-base font-medium">
											Maximum Backup Copies
										</h3>
										<p className="text-sm text-slate-500">
											Set the maximum number of backup copies to keep. Applied
											when the strategy is set to Keep N. Values below 1 are
											rounded up.
										</p>
									</div>
									<Input
										id={backupLimitId}
										type="number"
										min={1}
										value={dashboardSettings.clientBackupLimit}
										onChange={(event) => {
											const next = parseInt(event.target.value, 10);
											if (!Number.isNaN(next) && next > 0) {
												setDashboardSetting("clientBackupLimit", next);
											}
										}}
										disabled={
											dashboardSettings.clientBackupStrategy !== "keep_n"
										}
										className="w-48"
									/>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="develop" className="mt-0 h-full">
						<Card className="h-full">
							<CardHeader>
								<CardTitle>Developer</CardTitle>
								<CardDescription>
									Experimental toggles for internal debugging and navigation
									visibility.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-5">
								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Enable Server Debug
										</h3>
										<p className="text-sm text-slate-500">
											Expose debug instrumentation for newly added servers.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.enableServerDebug}
										onCheckedChange={(checked) =>
											setDashboardSetting("enableServerDebug", checked)
										}
									/>
								</div>

								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Open Debug Views In New Window
										</h3>
										<p className="text-sm text-slate-500">
											When enabled, Debug buttons launch a separate tab instead
											of navigating the current view.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.openDebugInNewWindow}
										onCheckedChange={(checked) =>
											setDashboardSetting("openDebugInNewWindow", checked)
										}
									/>
								</div>

								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Show API Docs Menu
										</h3>
										<p className="text-sm text-slate-500">
											Reveal the API Docs shortcut in the sidebar navigation.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.showApiDocsMenu}
										onCheckedChange={(checked) =>
											setDashboardSetting("showApiDocsMenu", checked)
										}
									/>
								</div>

								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">
											Show Raw Capability JSON
										</h3>
										<p className="text-sm text-slate-500">
											Display raw JSON payloads under Details in capability
											lists (Server details and Uni‑Import preview).
										</p>
									</div>
									<Switch
										checked={dashboardSettings.showRawCapabilityJson}
										onCheckedChange={(checked) =>
											setDashboardSetting("showRawCapabilityJson", checked)
										}
									/>
								</div>

								{/* Show Default Headers (redacted) */}
								<div className="flex items-center justify-between gap-4">
									<div>
										<h3 className="text-base font-medium">Show Default HTTP Headers</h3>
										<p className="text-sm text-slate-500">
											Display the server's default HTTP headers (values are redacted) in
											Server Details. Use only for debugging.
										</p>
									</div>
									<Switch
										checked={dashboardSettings.showDefaultHeaders}
										onCheckedChange={(checked) =>
											setDashboardSetting("showDefaultHeaders", checked)
										}
									/>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="market" className="mt-0 h-full">
						<MarketBlacklistCard
							entries={dashboardSettings.marketBlacklist}
							onRestore={removeFromMarketBlacklist}
							setDashboardSetting={setDashboardSetting}
							dashboardSettings={dashboardSettings}
							availablePortals={availablePortals}
						/>
					</TabsContent>
					{showLicenseTab && licenseDocument && (
						<TabsContent value="about" className="mt-0 h-full">
							<AboutLicensesSection document={licenseDocument} />
						</TabsContent>
					)}
				</div>
			</Tabs>
		</div>
	);
}

interface MarketBlacklistCardProps {
	entries: MarketBlacklistEntry[];
	onRestore: (serverId: string) => void;
	setDashboardSetting: <K extends keyof DashboardSettings>(
		key: K,
		value: DashboardSettings[K],
	) => void;
	dashboardSettings: DashboardSettings;
	availablePortals: Array<{ id: string; label: string }>;
}

function MarketBlacklistCard({
	entries,
	onRestore,
	setDashboardSetting,
	dashboardSettings,
	availablePortals,
}: MarketBlacklistCardProps) {
	const searchId = useId();
	const sortId = useId();
	const enableBlacklistId = useId();

	const [searchTerm, setSearchTerm] = useState("");
	const [sortOrder, setSortOrder] = useState<"recent" | "name">("recent");

	const enableMarketBlacklist = useAppStore(
		(state) => state.dashboardSettings.enableMarketBlacklist,
	);

	const filteredEntries = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		const list = query
			? entries.filter(
					(entry) =>
						entry.label.toLowerCase().includes(query) ||
						entry.serverId.toLowerCase().includes(query) ||
						(entry.description?.toLowerCase() ?? "").includes(query),
				)
			: entries;

		return [...list].sort((a, b) => {
			if (sortOrder === "name") {
				return a.label.localeCompare(b.label, undefined, {
					sensitivity: "base",
				});
			}
			return b.hiddenAt - a.hiddenAt;
		});
	}, [entries, searchTerm, sortOrder]);

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle>MCP Market</CardTitle>
				<CardDescription>
					Configure default market and manage hidden marketplace servers.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex h-full flex-col gap-4">
				{/* Default Market 设置项 */}
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-0.5">
						<h3 className="text-base font-medium">Default Market</h3>
						<p className="text-sm text-slate-500">
							Choose which market appears first and cannot be closed
						</p>
					</div>
					<Select
						value={dashboardSettings.defaultMarket}
						onValueChange={(value) =>
							setDashboardSetting("defaultMarket", value as DefaultMarket)
						}
					>
						<SelectTrigger className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="official">Official MCP Registry</SelectItem>
							{availablePortals.map((portal) => (
								<SelectItem key={portal.id} value={portal.id}>
									{portal.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Enable Blacklist 设置项 */}
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-0.5">
						<h3 className="text-base font-medium">Enable Blacklist</h3>
						<p className="text-sm text-slate-500">
							Hide quality-poor or unavailable content from the market to keep
							it clean
						</p>
					</div>
					<Switch
						id={enableBlacklistId}
						checked={enableMarketBlacklist}
						onCheckedChange={(checked) =>
							setDashboardSetting("enableMarketBlacklist", checked)
						}
					/>
				</div>

				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:gap-3">
						<div className="grow">
							<Label htmlFor="market-blacklist-search" className="sr-only">
								Search hidden servers
							</Label>
							<Input
								id={searchId}
								placeholder="Search hidden servers..."
								value={searchTerm}
								onChange={(event) => setSearchTerm(event.target.value)}
							/>
						</div>
						<div className="w-full md:ml-auto md:w-52">
							<Label htmlFor="market-blacklist-sort" className="sr-only">
								Sort hidden servers
							</Label>
							<Select
								value={sortOrder}
								onValueChange={(value) =>
									setSortOrder(value as "recent" | "name")
								}
							>
								<SelectTrigger id={sortId}>
									<SelectValue placeholder="Sort" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="recent">Most Recently Hidden</SelectItem>
									<SelectItem value="name">Name (A-Z)</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				{filteredEntries.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
						<p>No hidden servers currently.</p>
						<p className="mt-1 text-xs text-slate-400">
							Hide servers from the Market list to keep this space tidy. They
							will appear here for recovery.
						</p>
					</div>
				) : (
					<div className="flex-1 space-y-4 overflow-y-auto pr-1">
						{filteredEntries.map((entry) => {
							const hiddenDate = new Date(entry.hiddenAt);
							const hiddenLabel = Number.isNaN(hiddenDate.getTime())
								? "Unknown"
								: hiddenDate.toLocaleString();
							return (
								<div
									key={entry.serverId}
									className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
								>
									<div className="flex flex-col gap-1">
										<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
											{entry.label}
										</p>
										<p className="text-xs text-slate-500">
											{entry.description?.trim() || "No notes added."}
										</p>
										<p className="text-xs text-slate-400">
											Hidden on {hiddenLabel}
										</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => onRestore(entry.serverId)}
										className="flex items-center gap-2"
									>
										<RotateCcw className="h-4 w-4" />
										<span>Restore</span>
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
