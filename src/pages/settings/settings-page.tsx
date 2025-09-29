import { Moon, RotateCcw, Sun } from "lucide-react";
import { useId, useMemo, useState } from "react";
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
	type MarketBlacklistEntry,
	useAppStore,
} from "../../lib/store";

export function SettingsPage() {
	const defaultViewId = useId();
	const appModeId = useId();
	const clientModeId = useId();
	const backupStrategyId = useId();
	const backupLimitId = useId();

	const theme = useAppStore((state) => state.theme);
	const setTheme = useAppStore((state) => state.setTheme);
	const dashboardSettings = useAppStore((state) => state.dashboardSettings);
	const setDashboardSetting = useAppStore((state) => state.setDashboardSetting);
	const removeFromMarketBlacklist = useAppStore(
		(state) => state.removeFromMarketBlacklist,
	);

	const tabTriggerClass =
		"justify-start px-3 py-2 text-left text-sm font-medium text-slate-600 data-[state=active]:text-emerald-700 dark:text-slate-300";

	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold tracking-tight">Settings</h2>

			<Tabs
				defaultValue="general"
				orientation="vertical"
				className="flex flex-col gap-4 xl:flex-row xl:items-start"
			>
				<TabsList className="flex w-full flex-row flex-wrap gap-2 overflow-x-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-900 xl:w-64 xl:flex-col xl:overflow-visible xl:p-3 xl:self-start">
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
						Market Blacklist
					</TabsTrigger>
					<TabsTrigger value="develop" className={tabTriggerClass}>
						Developer
					</TabsTrigger>
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
							<CardContent className="space-y-6">
								<div className="space-y-2">
									<Label htmlFor="default-view">Default View</Label>
									<Select
										value={dashboardSettings.defaultView}
										onValueChange={(value: DashboardDefaultView) =>
											setDashboardSetting("defaultView", value)
										}
									>
										<SelectTrigger id={defaultViewId}>
											<SelectValue placeholder="Select a default view" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="list">List</SelectItem>
											<SelectItem value="grid">Grid</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="app-mode">Application Mode</Label>
									<Select
										value={dashboardSettings.appMode}
										onValueChange={(value: DashboardAppMode) =>
											setDashboardSetting("appMode", value)
										}
									>
										<SelectTrigger id={appModeId}>
											<SelectValue placeholder="Select application mode" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="express">Express Mode</SelectItem>
											<SelectItem value="expert">Expert Mode (WIP)</SelectItem>
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
							<CardContent className="space-y-6">
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-4">
										<div className="space-y-0.5">
											<h3 className="text-base font-medium">Theme</h3>
											<p className="text-sm text-slate-500">
												Switch between light and dark mode.
											</p>
										</div>
										<div className="flex gap-2">
											<Button
												variant={theme === "light" ? "default" : "outline"}
												size="sm"
												onClick={() => setTheme("light")}
												className="w-24"
											>
												<Sun className="mr-2 h-4 w-4" />
												Light
											</Button>
											<Button
												variant={theme === "dark" ? "default" : "outline"}
												size="sm"
												onClick={() => setTheme("dark")}
												className="w-24"
											>
												<Moon className="mr-2 h-4 w-4" />
												Dark
											</Button>
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
							<CardContent className="space-y-6">
								<div className="space-y-2">
									<Label htmlFor="client-mode">Client Application Mode</Label>
									<Select
										value={dashboardSettings.clientDefaultMode}
										onValueChange={(value: ClientDefaultMode) =>
											setDashboardSetting("clientDefaultMode", value)
										}
									>
										<SelectTrigger id={clientModeId}>
											<SelectValue placeholder="Select client mode" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="hosted">Hosted Mode</SelectItem>
											<SelectItem value="transparent">
												Transparent Mode
											</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="backup-strategy">
										Client Backup Strategy
									</Label>
									<Select
										value={dashboardSettings.clientBackupStrategy}
										onValueChange={(value: ClientBackupStrategy) =>
											setDashboardSetting("clientBackupStrategy", value)
										}
									>
										<SelectTrigger id={backupStrategyId}>
											<SelectValue placeholder="Select backup strategy" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="keep_n">Keep_N</SelectItem>
											<SelectItem value="keep_last">Keep_last</SelectItem>
											<SelectItem value="none">None</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="backup-limit">Maximum Backup Copies</Label>
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
									/>
									<p className="text-xs text-slate-500">
										Applied when the strategy is set to Keep N. Values below 1
										are rounded up.
									</p>
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
											When enabled, Debug buttons launch a separate tab instead of navigating the current view.
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
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="market" className="mt-0 h-full">
						<MarketBlacklistCard
							entries={dashboardSettings.marketBlacklist}
							onRestore={removeFromMarketBlacklist}
						/>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}

interface MarketBlacklistCardProps {
	entries: MarketBlacklistEntry[];
	onRestore: (serverId: string) => void;
}

function MarketBlacklistCard({ entries, onRestore }: MarketBlacklistCardProps) {
	const searchId = useId();
	const sortId = useId();

	const [searchTerm, setSearchTerm] = useState("");
	const [sortOrder, setSortOrder] = useState<"recent" | "name">("recent");

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
				<CardTitle>Market Blacklist</CardTitle>
				<CardDescription>
					Manage hidden marketplace servers so they stay out of browse and
					search views.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex h-full flex-col gap-4">
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
					<div className="flex-1 space-y-3 overflow-y-auto pr-1">
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
