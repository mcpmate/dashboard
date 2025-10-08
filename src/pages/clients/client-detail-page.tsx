import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Download,
	Play,
	RefreshCw,
	RotateCcw,
	Square,
	Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
	CapsuleStripeList,
	CapsuleStripeListItem,
} from "../../components/capsule-stripe-list";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ButtonGroup } from "../../components/ui/button-group";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../components/ui/tabs";
import { clientsApi } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import type {
	ClientBackupEntry,
	ClientBackupPolicySetReq,
	ClientConfigMode,
	ClientConfigSelected,
	ClientConfigUpdateData,
} from "../../lib/types";
import { formatBackupTime } from "../../lib/utils";

type ClientDetailTab = "overview" | "configuration" | "backups";

function extractServers(obj: any): string[] {
	if (!obj || typeof obj !== "object") return [];
	if (obj.mcpServers && typeof obj.mcpServers === "object") {
		return Object.keys(obj.mcpServers);
	}
	if (obj.mcp_servers && typeof obj.mcp_servers === "object") {
		return Object.keys(obj.mcp_servers);
	}
	if (obj.mcp && Array.isArray(obj.mcp.servers)) {
		return obj.mcp.servers.map((s: any) => s?.name).filter(Boolean);
	}
	if (Array.isArray(obj.servers)) {
		return obj.servers.map((s: any) => s?.name).filter(Boolean);
	}
	return [];
}

export function ClientDetailPage() {
	const { identifier } = useParams<{ identifier: string }>();
	const qc = useQueryClient();
	const [displayName, setDisplayName] = useState("");
	const [selectedBackups, setSelectedBackups] = useState<string[]>([]);
	const [detected, setDetected] = useState<boolean>(false);
	const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
	const [tabValue, setTabValue] = useState<ClientDetailTab>("overview");

	// Try to get display name from list cache
	useEffect(() => {
		const cached = qc.getQueryData<any>(["clients"]);
		if (cached?.client) {
			const found = cached.client.find((c: any) => c.identifier === identifier);
			if (found) {
				setDisplayName(found.display_name);
				setDetected(!!found.detected);
			}
		}
		if (!displayName) {
			// Fallback: fetch list once to resolve display name
			clientsApi
				.list(false)
				.then((d) => {
					if (d?.client) {
						const f = d.client.find((c: any) => c.identifier === identifier);
						if (f?.display_name) setDisplayName(f.display_name);
						if (typeof f?.detected === "boolean") setDetected(!!f.detected);
					}
				})
				.catch(() => {});
		}
	}, [identifier, qc, displayName]);

	const modeId = useId();
	const sourceId = useId();
	const limitId = useId();
	const [mode, setMode] = useState<ClientConfigMode>("hosted");
	const [selectedConfig, setSelectedConfig] =
		useState<ClientConfigSelected>("default");
	const [applyResult, setApplyResult] = useState<ClientConfigUpdateData | null>(
		null,
	);
	const [lastAction, setLastAction] = useState<"preview" | "apply" | null>(
		null,
	);
	const [policyOpen, setPolicyOpen] = useState(false);
	const [importPreviewOpen, setImportPreviewOpen] = useState(false);
	const [importPreviewData, setImportPreviewData] = useState<any | null>(null);

	const {
		data: configDetails,
		isLoading: loadingConfig,
		refetch: refetchDetails,
	} = useQuery({
		queryKey: ["client-config", identifier],
		queryFn: () => clientsApi.configDetails(identifier || "", false),
		enabled: !!identifier,
	});

	const {
		data: backupsData,
		isLoading: loadingBackups,
		refetch: refetchBackups,
	} = useQuery({
		queryKey: ["client-backups", identifier],
		queryFn: () => clientsApi.listBackups(identifier || undefined),
		enabled: !!identifier,
	});

	const backups: ClientBackupEntry[] = backupsData?.backups || [];
	const visibleBackups = useMemo(
		() => backups.filter((b) => b.identifier === identifier),
		[backups, identifier],
	);

	const templateMeta = configDetails?.template;
	const detailDescription =
		configDetails?.description ?? templateMeta?.description ?? "";
	const detailHomepageUrl =
		configDetails?.homepage_url ?? templateMeta?.homepage_url ?? "";
	const detailDocsUrl = configDetails?.docs_url ?? templateMeta?.docs_url ?? "";
	const detailSupportUrl =
		configDetails?.support_url ?? templateMeta?.support_url ?? "";

	const [logEntries, setLogEntries] = useState<
		Array<{
			id: string;
			message: string;
			level: "warning";
			timestamp: string;
		}>
	>([]);
	const [logFilter, setLogFilter] = useState("");

	useEffect(() => {
		if (configDetails?.warnings?.length) {
			setLogEntries((prev) => {
				const existing = new Set(prev.map((entry) => entry.message));
				const next = [...prev];
				for (const warning of configDetails.warnings ?? []) {
					if (!existing.has(warning)) {
						next.push({
							id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
							message: warning,
							level: "warning",
							timestamp: new Date().toISOString(),
						});
					}
				}
				return next;
			});
		}
	}, [configDetails?.warnings]);

	const filteredLogs = useMemo(() => {
		if (!logFilter.trim()) {
			return logEntries;
		}
		const term = logFilter.toLowerCase();
		return logEntries.filter((entry) =>
			entry.message.toLowerCase().includes(term),
		);
	}, [logEntries, logFilter]);

	const { data: policyData, refetch: refetchPolicy } = useQuery({
		queryKey: ["client-policy", identifier],
		queryFn: () => clientsApi.getBackupPolicy(identifier || ""),
		enabled: !!identifier,
	});

	const applyMutation = useMutation<
		{ data: ClientConfigUpdateData | null; preview: boolean },
		unknown,
		{ preview: boolean }
	>({
		mutationFn: async ({ preview }) => {
			const data = await clientsApi.applyConfig({
				identifier: identifier!,
				mode,
				selected_config: selectedConfig,
				preview,
			});
			return { data: data ?? null, preview };
		},
		onMutate: ({ preview }) => {
			setLastAction(preview ? "preview" : "apply");
			if (preview) {
				setApplyResult(null);
			}
		},
		onSuccess: ({ data, preview }) => {
			if (preview) {
				if (data) {
					setApplyResult(data);
					notifyInfo("Preview ready", "Review the diff before applying.");
				} else {
					notifyInfo(
						"Preview ready",
						"No changes detected in this configuration.",
					);
				}
			} else {
				notifySuccess("Applied", "Configuration applied");
				setApplyResult(null);
			}
			qc.invalidateQueries({ queryKey: ["client-config", identifier] });
		},
		onError: (e) => notifyError("Apply failed", String(e)),
	});

	const importMutation = useMutation({
		mutationFn: async () => {
			// If no preview yet, generate one first
			if (!importPreviewData) {
				const res = await clientsApi.importFromClient(identifier!, {
					preview: true,
				});
				setImportPreviewData(res);
				return null as any; // indicate preview stage; caller handles UI
			}
			return clientsApi.importFromClient(identifier!, { preview: false });
		},
		onSuccess: (res: any) => {
			// If onSuccess received null means we just did a preview; do not close
			if (!res) return;
			const imported =
				res?.imported_servers?.length ?? res?.summary?.imported_count ?? 0;
			if (imported > 0) {
				notifySuccess(
					"Imported",
					`${imported} server(s) imported successfully`,
				);
				setImportPreviewOpen(false);
			} else {
				notifyInfo(
					"Nothing to import",
					"All entries were skipped or no importable servers found.",
				);
				setImportPreviewOpen(false);
			}
		},
		onError: (e) => notifyError("Import failed", String(e)),
	});

	// Header actions: refresh detection and toggle managed
	const refreshDetectMutation = useMutation({
		mutationFn: async () => {
			const data = await clientsApi.list(true);
			if (data?.client) {
				const f = data.client.find((c: any) => c.identifier === identifier);
				if (f) {
					if (typeof f.display_name === "string")
						setDisplayName(f.display_name);
					setDetected(!!f.detected);
				}
			}
			await refetchDetails();
		},
		onSuccess: () => notifySuccess("Refreshed", "Detection refreshed"),
		onError: (e) => notifyError("Refresh failed", String(e)),
	});

	const toggleManagedMutation = useMutation({
		mutationFn: async () => {
			const next = !(configDetails?.managed ?? false);
			await clientsApi.manage(identifier!, next ? "enable" : "disable");
			await refetchDetails();
		},
		onSuccess: () => notifySuccess("Updated", "Managed state changed"),
		onError: (e) => notifyError("Update failed", String(e)),
	});
	const importPreviewMutation = useMutation({
		mutationFn: () =>
			clientsApi.importFromClient(identifier!, { preview: true }),
		onSuccess: (res) => {
			setImportPreviewData(res);
			setImportPreviewOpen(true);
		},
		onError: (e) => notifyError("Preview failed", String(e)),
	});

	const restoreMutation = useMutation({
		mutationFn: ({ backup }: { backup: string }) =>
			clientsApi.restoreConfig({ identifier: identifier!, backup }),
		onSuccess: () => {
			notifySuccess("Restored", "Configuration restored from backup");
			refetchDetails();
			refetchBackups();
		},
		onError: (e) => notifyError("Restore failed", String(e)),
	});

	const deleteBackupMutation = useMutation({
		mutationFn: ({ backup }: { backup: string }) =>
			clientsApi.deleteBackup(identifier!, backup),
		onSuccess: () => {
			notifySuccess("Deleted", "Backup deleted");
			refetchBackups();
		},
		onError: (e) => notifyError("Delete failed", String(e)),
	});

	const bulkDeleteMutation = useMutation({
		mutationFn: async () => {
			const items = [...selectedBackups];
			const results = await Promise.allSettled(
				items.map((b) => clientsApi.deleteBackup(identifier!, b)),
			);
			const failed = results.filter((r) => r.status === "rejected").length;
			if (failed > 0) throw new Error(`${failed} deletions failed`);
		},
		onSuccess: async () => {
			notifySuccess("Deleted", "Selected backups have been deleted");
			setSelectedBackups([]);
			setBulkConfirmOpen(false);
			await refetchBackups();
		},
		onError: (e) => notifyError("Bulk delete failed", String(e)),
	});

	const [confirm, setConfirm] = useState<null | {
		kind: "delete" | "restore";
		backup: string;
	}>(null);

	const setPolicyMutation = useMutation({
		mutationFn: (payload: ClientBackupPolicySetReq) =>
			clientsApi.setBackupPolicy(payload),
		onSuccess: () => {
			notifySuccess("Saved", "Backup policy updated");
			refetchPolicy();
		},
		onError: (e) => notifyError("Save failed", String(e)),
	});

	const [policyLabel, setPolicyLabel] = useState<string>("keep_n");
	const [policyLimit, setPolicyLimit] = useState<number | undefined>(30);
	useEffect(() => {
		if (policyData) {
			setPolicyLabel(policyData.policy || "keep_n");
			setPolicyLimit(policyData.limit ?? undefined);
		}
	}, [policyData]);

	// Heuristic extract current servers from config content for preview
	const currentServers = useMemo(() => {
		const c = (configDetails as any)?.content as any;
		try {
			if (!c) return [] as string[];
			if (typeof c === "string") {
				const parsed = JSON.parse(c);
				return extractServers(parsed);
			}
			return extractServers(c);
		} catch {
			return [] as string[];
		}
	}, [configDetails]);

	if (!identifier)
		return <div className="p-4">No client identifier provided.</div>;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-3 flex-wrap">
						<h2 className="text-3xl font-bold tracking-tight">
							{displayName || identifier}
						</h2>
						{/* Managed / Detected badges */}
						{typeof configDetails?.managed === "boolean" ? (
							<Badge variant={configDetails.managed ? "secondary" : "outline"}>
								{configDetails.managed ? "Managed" : "Unmanaged"}
							</Badge>
						) : null}
						<Badge variant={detected ? "default" : "secondary"}>
							{detected ? "Detected" : "Not Detected"}
						</Badge>
					</div>
					{detailDescription ? (
						<p className="text-sm text-muted-foreground leading-snug w-full truncate">
							{detailDescription}
						</p>
					) : null}
				</div>
				{/* 操作按钮移至 Overview 卡片右上角 */}
			</div>

			<Tabs
				value={tabValue}
				onValueChange={(value) => setTabValue(value as ClientDetailTab)}
			>
				<div className="flex items-center justify-between">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="configuration">Configuration</TabsTrigger>
						<TabsTrigger value="backups">Backups</TabsTrigger>
						<TabsTrigger value="logs">Logs</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="overview">
					<div className="grid gap-4">
						<Card>
							{loadingConfig ? (
								<CardContent className="text-sm">
									<div className="animate-pulse h-16 bg-slate-200 dark:bg-slate-800 rounded" />
								</CardContent>
							) : configDetails ? (
								<CardContent className="p-4">
									<div className="flex flex-col gap-4">
										<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
											<div className="flex flex-wrap items-start gap-4">
												<Avatar className="text-sm">
													{configDetails.logo_url ? (
														<AvatarImage
															src={configDetails.logo_url}
															alt={displayName || identifier}
														/>
													) : null}
													<AvatarFallback>
														{(displayName || identifier || "C")
															.slice(0, 1)
															.toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
													<span className="text-xs uppercase text-slate-500">
														Config Path
													</span>
													<span className="font-mono text-xs truncate max-w-[520px]">
														{configDetails.config_path}
													</span>

													<span className="text-xs uppercase text-slate-500">
														Last Modified
													</span>
													<span className="text-xs">
														{configDetails.last_modified || "-"}
													</span>

													{detailHomepageUrl ? (
														<>
															<span className="text-xs uppercase text-slate-500">
																Homepage
															</span>
															<a
																href={detailHomepageUrl}
																target="_blank"
																rel="noreferrer"
																className="text-xs underline underline-offset-2 truncate"
															>
																{detailHomepageUrl}
															</a>
														</>
													) : null}
													{detailDocsUrl ? (
														<>
															<span className="text-xs uppercase text-slate-500">
																Docs
															</span>
															<a
																href={detailDocsUrl}
																target="_blank"
																rel="noreferrer"
																className="text-xs underline underline-offset-2 truncate"
															>
																{detailDocsUrl}
															</a>
														</>
													) : null}
													{detailSupportUrl ? (
														<>
															<span className="text-xs uppercase text-slate-500">
																Support
															</span>
															<a
																href={detailSupportUrl}
																target="_blank"
																rel="noreferrer"
																className="text-xs underline underline-offset-2 truncate"
															>
																{detailSupportUrl}
															</a>
														</>
													) : null}
												</div>
											</div>
											<ButtonGroup className="ml-auto flex-shrink-0 flex-nowrap self-start">
												<Button
													variant="outline"
													size="sm"
													onClick={() => refreshDetectMutation.mutate()}
													disabled={refreshDetectMutation.isPending}
													className="gap-2"
												>
													<RefreshCw
														className={`h-4 w-4 ${refreshDetectMutation.isPending ? "animate-spin" : ""}`}
													/>
													Refresh
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => toggleManagedMutation.mutate()}
													disabled={
														toggleManagedMutation.isPending || !configDetails
													}
													className="gap-2"
												>
													{configDetails?.managed ? (
														<Square className="h-4 w-4" />
													) : (
														<Play className="h-4 w-4" />
													)}
													{configDetails?.managed ? "Disable" : "Enable"}
												</Button>
											</ButtonGroup>
										</div>
									</div>
								</CardContent>
							) : (
								<CardContent className="text-sm text-slate-500">
									No details available
								</CardContent>
							)}
						</Card>
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle>Current Servers</CardTitle>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => importPreviewMutation.mutate()}
										>
											<Download className="mr-2 h-4 w-4" /> Import from Config
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								{loadingConfig ? (
									<div className="space-y-2">
										{[1, 2, 3].map((i) => (
											<div
												key={i}
												className="h-8 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-[10px]"
											/>
										))}
									</div>
								) : currentServers.length ? (
									<CapsuleStripeList>
										{currentServers.map((n) => (
											<CapsuleStripeListItem key={n}>
												<div className="font-mono">{n}</div>
												<div className="text-xs text-slate-500">configured</div>
											</CapsuleStripeListItem>
										))}
									</CapsuleStripeList>
								) : (
									<div className="text-sm text-slate-500">
										No servers extracted from current config.
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				<TabsContent value="configuration">
					<div className="grid gap-4">
						<Card>
							<CardHeader>
								<div>
									<CardTitle>Configuration Mode</CardTitle>
									<CardDescription>
										Choose how MCPMate generates and applies configuration for
										this client.
									</CardDescription>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1">
										<Label htmlFor={modeId}>Mode</Label>
										<Select
											value={mode}
											onValueChange={(v) => setMode(v as ClientConfigMode)}
										>
											<SelectTrigger id={modeId}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="hosted">hosted</SelectItem>
												<SelectItem value="transparent">transparent</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-1">
										<Label htmlFor={sourceId}>Source</Label>
										<Select
											value={selectedConfig}
											onValueChange={(v) =>
												setSelectedConfig(v as ClientConfigSelected)
											}
										>
											<SelectTrigger id={sourceId}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="default">default</SelectItem>
												<SelectItem value="profile">profile</SelectItem>
												<SelectItem value="custom">custom</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
								{applyMutation.isPending && (
									<div className="h-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								)}
								{applyResult ? (
									<div className="space-y-4 rounded border p-3 text-xs">
										<div className="grid gap-2 sm:grid-cols-3">
											<div>
												<span className="text-slate-500">Format</span>
												<div className="font-medium">
													{applyResult.diff_format ?? "-"}
												</div>
											</div>
											<div>
												<span className="text-slate-500">Warnings</span>
												<div className="font-medium">
													{applyResult.warnings?.length ?? 0}
												</div>
											</div>
											<div>
												<span className="text-slate-500">Scheduled</span>
												<div className="font-medium">
													{applyResult.scheduled ? "Yes" : "No"}
												</div>
											</div>
										</div>
										{applyResult.warnings && applyResult.warnings.length > 0 ? (
											<ul className="list-disc space-y-1 pl-5 text-amber-600 dark:text-amber-400">
												{applyResult.warnings.map((warning, idx) => (
													<li key={`warning-${idx}-${warning.slice(0, 20)}`}>
														{warning}
													</li>
												))}
											</ul>
										) : null}
										{applyResult.preview ? (
											<details>
												<summary className="cursor-pointer text-slate-500">
													Preview payload
												</summary>
												<pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-3 text-[11px] leading-relaxed dark:bg-slate-900">
													{JSON.stringify(applyResult.preview, null, 2)}
												</pre>
											</details>
										) : null}
										{applyResult.diff_before || applyResult.diff_after ? (
											<div className="grid gap-3 sm:grid-cols-2">
												<div>
													<div className="mb-1 text-slate-500">Before</div>
													<pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-[11px] leading-relaxed dark:bg-slate-900">
														{applyResult.diff_before || "-"}
													</pre>
												</div>
												<div>
													<div className="mb-1 text-slate-500">After</div>
													<pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-[11px] leading-relaxed dark:bg-slate-900">
														{applyResult.diff_after || "-"}
													</pre>
												</div>
											</div>
										) : null}
									</div>
								) : lastAction === "preview" && !applyMutation.isPending ? (
									<p className="text-xs text-slate-500">
										No preview details available for the selected options.
									</p>
								) : null}
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				<TabsContent value="backups">
					<Card>
						<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle>Backups</CardTitle>
								<CardDescription>
									Review, restore, or delete configuration snapshots.
								</CardDescription>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => refetchBackups()}
									disabled={loadingBackups}
								>
									<RefreshCw
										className={`mr-2 h-4 w-4 ${loadingBackups ? "animate-spin" : ""}`}
									/>
									Refresh
								</Button>
								{!loadingBackups && visibleBackups.length > 0 && (
									<ButtonGroup>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setSelectedBackups(visibleBackups.map((b) => b.backup))
											}
										>
											Select all
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setSelectedBackups([])}
										>
											Clear
										</Button>
										<Button
											size="sm"
											variant="destructive"
											disabled={
												bulkDeleteMutation.isPending ||
												selectedBackups.length === 0
											}
											onClick={() => setBulkConfirmOpen(true)}
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete selected ({selectedBackups.length})
										</Button>
									</ButtonGroup>
								)}
							</div>
						</CardHeader>
						<CardContent className="space-y-4 pt-0">
							{loadingBackups ? (
								<div className="space-y-2">
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"
										/>
									))}
								</div>
							) : visibleBackups.length ? (
								<CapsuleStripeList>
									{visibleBackups.map((b) => {
										const selected = selectedBackups.includes(b.backup);
										return (
											<CapsuleStripeListItem
												key={b.path}
												interactive
												className={`group relative transition-colors ${selected ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
												onClick={() =>
													setSelectedBackups((prev) =>
														prev.includes(b.backup)
															? prev.filter((x) => x !== b.backup)
															: [...prev, b.backup],
													)
												}
											>
												<div className="flex items-center justify-between flex-1">
													<div className="flex items-center gap-3">
														<div
															className={`flex h-6 w-6 items-center justify-center rounded-full border text-[0px] transition-all duration-200 ${
																selected
																	? "border-primary bg-primary text-white shadow-sm"
																	: "border-slate-300 text-transparent group-hover:border-primary/50 group-hover:text-primary/60 dark:border-slate-700 dark:group-hover:border-primary/50"
															}`}
														>
															<Check className="h-3 w-3" />
														</div>
														<div
															className={`font-mono transition-colors duration-200 ${
																selected
																	? "text-primary"
																	: "text-slate-700 dark:text-slate-200"
															}`}
														>
															{b.backup}
														</div>
													</div>
													<div className="flex items-center justify-end gap-4">
														<div
															className={`flex items-center gap-4 text-slate-500 transition-all duration-200 ${
																selected ? "text-primary" : ""
															}`}
														>
															<div>{formatBackupTime(b.created_at)}</div>
															<div>{(b.size / 1024).toFixed(1)} KB</div>
														</div>
														<div className="flex items-center gap-2 overflow-hidden transition-all duration-200 opacity-0 max-w-0 pointer-events-none group-hover:max-w-[12rem] group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:max-w-[12rem] group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
															<Button
																size="sm"
																variant="outline"
																onClick={(e) => {
																	e.stopPropagation();
																	setConfirm({
																		kind: "restore",
																		backup: b.backup,
																	});
																}}
															>
																<RotateCcw className="mr-2 h-4 w-4" />
																Restore
															</Button>
															<Button
																size="icon"
																variant="outline"
																onClick={(e) => {
																	e.stopPropagation();
																	setConfirm({
																		kind: "delete",
																		backup: b.backup,
																	});
																}}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													</div>
												</div>
											</CapsuleStripeListItem>
										);
									})}
								</CapsuleStripeList>
							) : (
								<div className="text-slate-500 text-sm">No backups.</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="logs">
					<Card>
						<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle>Logs</CardTitle>
								<CardDescription>
									Runtime warnings and backend notes for this client.
								</CardDescription>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Input
									type="search"
									placeholder="Search logs..."
									value={logFilter}
									onChange={(event) => setLogFilter(event.target.value)}
									className="h-8 w-48"
								/>
								<Button
									size="sm"
									variant="outline"
									onClick={() => setLogEntries([])}
									disabled={!logEntries.length}
								>
									Clear Logs
								</Button>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{filteredLogs.length ? (
								<div className="space-y-3">
									{filteredLogs.map((entry) => (
										<div
											key={entry.id}
											className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
										>
											<div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
												<span>
													{new Date(entry.timestamp).toLocaleTimeString()}
												</span>
												<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
													Warning
												</span>
											</div>
											<pre className="px-4 py-3 text-[12px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
												{entry.message}
											</pre>
										</div>
									))}
								</div>
							) : (
								<div className="rounded border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
									No log entries recorded for this client yet.
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			<ConfirmDialog
				isOpen={!!confirm}
				onClose={() => setConfirm(null)}
				title={confirm?.kind === "delete" ? "Delete Backup" : "Restore Backup"}
				description={
					confirm?.kind === "delete"
						? "Are you sure you want to delete this backup? This action cannot be undone."
						: "Restore configuration from the selected backup? Current config may be overwritten."
				}
				confirmLabel={confirm?.kind === "delete" ? "Delete" : "Restore"}
				variant={confirm?.kind === "delete" ? "destructive" : "default"}
				isLoading={deleteBackupMutation.isPending || restoreMutation.isPending}
				onConfirm={async () => {
					if (!confirm) return;
					if (confirm.kind === "delete") {
						await deleteBackupMutation.mutateAsync({ backup: confirm.backup });
					} else {
						await restoreMutation.mutateAsync({ backup: confirm.backup });
					}
					setConfirm(null);
				}}
			/>

			{/* Bulk delete confirmation */}
			<ConfirmDialog
				isOpen={bulkConfirmOpen}
				onClose={() => setBulkConfirmOpen(false)}
				title="Delete Selected Backups"
				description={`Are you sure you want to delete ${selectedBackups.length} backup(s)? This action cannot be undone.`}
				confirmLabel="Delete"
				variant="destructive"
				isLoading={bulkDeleteMutation.isPending}
				onConfirm={() => bulkDeleteMutation.mutate()}
			/>

			{/* Backup Policy Drawer */}
			<Drawer open={policyOpen} onOpenChange={setPolicyOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Backup Policy</DrawerTitle>
					</DrawerHeader>
					<div className="p-4 space-y-4">
						<div className="space-y-1">
							<Label>Policy</Label>
							<p className="text-xs text-slate-500">
								Backup retention strategy. For now, only "keep_n" is supported,
								which keeps at most N recent backups and prunes older ones.
							</p>
							<Select value={policyLabel} onValueChange={setPolicyLabel}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="keep_n">keep_n</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor={limitId}>Limit</Label>
							<p className="text-xs text-slate-500">
								Maximum number of backups to keep for this client. Set to 0 for
								no limit.
							</p>
							<Input
								id={limitId}
								type="number"
								min={0}
								value={policyLimit ?? 0}
								onChange={(e) => setPolicyLimit(Number(e.target.value))}
							/>
						</div>
						<div>
							<Button
								onClick={() =>
									setPolicyMutation.mutate({
										identifier: identifier!,
										policy: { label: policyLabel, limit: policyLimit },
									})
								}
								disabled={setPolicyMutation.isPending}
							>
								Save Policy
							</Button>
						</div>
					</div>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>

			{/* Import Preview Drawer */}
			<Drawer open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Import Preview</DrawerTitle>
						<DrawerDescription>
							Summary of servers detected from current client config.
						</DrawerDescription>
					</DrawerHeader>
					<div className="p-4 text-sm flex flex-col gap-4 max-h-[70vh]">
						{importPreviewMutation.isPending ? (
							<div className="h-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
						) : importPreviewData ? (
							<div className="flex-1 min-h-0 flex flex-col gap-4">
								<div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 text-sm leading-6">
									<div className="text-slate-500">Attempted</div>
									<div>
										{typeof importPreviewData.summary?.attempted === "boolean"
											? importPreviewData.summary.attempted
												? "Yes"
												: "No"
											: "-"}
									</div>
									<div className="text-slate-500">Imported</div>
									<div>{importPreviewData.summary?.imported_count ?? 0}</div>
									<div className="text-slate-500">Skipped</div>
									<div>{importPreviewData.summary?.skipped_count ?? 0}</div>
									<div className="text-slate-500">Failed</div>
									<div>{importPreviewData.summary?.failed_count ?? 0}</div>
								</div>
								{Array.isArray(importPreviewData.items) &&
								importPreviewData.items.length > 0 ? (
									<div className="rounded border">
										<div className="px-3 py-2 text-xs text-slate-500 border-b">
											Servers to import
										</div>
										<ul className="divide-y max-h-[30vh] overflow-auto">
											{importPreviewData.items.map((it: any, idx: number) => (
												<li
													key={`import-item-${idx}-${it.name || it.server_name || "unnamed"}`}
													className="p-3 text-xs"
												>
													<div className="font-medium">
														{it.name || it.server_name || `#${idx + 1}`}
													</div>
													{it.error ? (
														<div className="text-red-500">
															{String(it.error)}
														</div>
													) : null}
													<div className="mt-1 text-slate-500">
														tools: {it.tools?.items?.length ?? 0} • resources:{" "}
														{it.resources?.items?.length ?? 0} • templates:{" "}
														{it.resource_templates?.items?.length ?? 0} •
														prompts: {it.prompts?.items?.length ?? 0}
													</div>
												</li>
											))}
										</ul>
									</div>
								) : null}
								{importPreviewData.summary?.errors ? (
									<details>
										<summary className="text-xs text-slate-500 cursor-pointer">
											Errors
										</summary>
										<pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto max-h-[26vh]">
											{JSON.stringify(
												importPreviewData.summary.errors,
												null,
												2,
											)}
										</pre>
									</details>
								) : null}
								<details className="mt-2 flex-1 min-h-0">
									<summary className="text-xs text-slate-500 cursor-pointer">
										Raw preview JSON
									</summary>
									<pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto flex-1 min-h-0 max-h-[40vh]">
										{JSON.stringify(importPreviewData, null, 2)}
									</pre>
								</details>
							</div>
						) : (
							<div className="text-slate-500">No preview data.</div>
						)}
					</div>
					<DrawerFooter>
						<div className="flex w-full items-center justify-between">
							<Button
								variant="outline"
								onClick={() => setImportPreviewOpen(false)}
							>
								Close
							</Button>
							{importPreviewData ? (
								(importPreviewData?.summary?.imported_count ?? 0) > 0 ? (
									<Button
										onClick={() => importMutation.mutate()}
										disabled={importMutation.isPending}
									>
										Apply Import
									</Button>
								) : (
									<div className="text-xs text-slate-500">No import needed</div>
								)
							) : (
								<Button
									onClick={() => importPreviewMutation.mutate()}
									disabled={importPreviewMutation.isPending}
								>
									Preview
								</Button>
							)}
						</div>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

export default ClientDetailPage;
