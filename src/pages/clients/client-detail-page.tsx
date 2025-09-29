import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { clientsApi } from "../../lib/api";
import type {
	ClientBackupEntry,
	ClientBackupPolicySetReq,
	ClientConfigMode,
	ClientConfigSelected,
	ClientConfigUpdateData,
} from "../../lib/types";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../components/ui/tabs";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
	DrawerDescription,
} from "../../components/ui/drawer";
import {
	RefreshCw,
	RotateCcw,
	Trash2,
	Upload,
	MoreHorizontal,
	SlidersHorizontal,
	Eye,
} from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "../../components/ui/avatar";

export function ClientDetailPage() {
	const { identifier } = useParams<{ identifier: string }>();
	const qc = useQueryClient();
	const [displayName, setDisplayName] = useState("");
	const [selectedBackups, setSelectedBackups] = useState<string[]>([]);
	const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

	// Try to get display name from list cache
	useEffect(() => {
		const cached = qc.getQueryData<any>(["clients"]);
		if (cached?.client) {
			const found = cached.client.find((c: any) => c.identifier === identifier);
			if (found) setDisplayName(found.display_name);
		}
		if (!displayName) {
			// Fallback: fetch list once to resolve display name
			clientsApi
				.list(false)
				.then((d) => {
					const f = d.client?.find((c: any) => c.identifier === identifier);
					if (f?.display_name) setDisplayName(f.display_name);
				})
				.catch(() => {});
		}
	}, [identifier, qc]);

	const modeId = useId();
	const sourceId = useId();
	const limitId = useId();
	const [mode, setMode] = useState<ClientConfigMode>("hosted");
	const [selectedConfig, setSelectedConfig] =
		useState<ClientConfigSelected>("default");
	const [preview, setPreview] = useState(false);
	const [applyOpen, setApplyOpen] = useState(false);
	const [applyResult, setApplyResult] = useState<ClientConfigUpdateData | null>(
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

	const { data: policyData, refetch: refetchPolicy } = useQuery({
		queryKey: ["client-policy", identifier],
		queryFn: () => clientsApi.getBackupPolicy(identifier || ""),
		enabled: !!identifier,
	});

	const applyMutation = useMutation({
		mutationFn: () =>
			clientsApi.applyConfig({
				identifier: identifier!,
				mode,
				selected_config: selectedConfig,
				preview,
			}),
		onSuccess: (res) => {
			if (preview) {
				setApplyResult(res);
				notifyInfo("Preview generated", "See preview details below");
			} else {
				notifySuccess("Applied", "Configuration applied");
				setApplyOpen(false);
				setApplyResult(null);
			}
			qc.invalidateQueries({ queryKey: ["client-config", identifier] });
		},
		onError: (e) => notifyError("Apply failed", String(e)),
	});

	const importMutation = useMutation({
		mutationFn: () =>
			clientsApi.importFromClient(identifier!, { preview: false }),
		onSuccess: () =>
			notifySuccess("Imported", "Servers imported from client config (if any)"),
		onError: (e) => notifyError("Import failed", String(e)),
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

	if (!identifier)
		return <div className="p-4">No client identifier provided.</div>;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<h2 className="text-3xl font-bold tracking-tight">
						{displayName || identifier}
					</h2>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="outline">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={5}>
						<DropdownMenuItem onClick={() => setApplyOpen(true)}>
							<Upload className="mr-2 h-4 w-4" /> Apply Config
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setPolicyOpen(true)}>
							<SlidersHorizontal className="mr-2 h-4 w-4" /> Backup Policy
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Tabs defaultValue="overview">
				<div className="flex items-center justify-between">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="backups">Backups</TabsTrigger>
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
								<>
									<CardHeader className="flex flex-row items-center gap-3 pb-0">
										<Avatar className="h-12 w-12">
											{(configDetails as any)?.logo_url ? (
												<AvatarImage
													src={(configDetails as any).logo_url}
													alt={displayName || identifier}
												/>
											) : null}
											<AvatarFallback>
												{(displayName || identifier || "C")
													.slice(0, 1)
													.toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div>
											<div className="text-lg font-semibold leading-tight">
												{displayName || identifier}
											</div>
											<div className="text-xs text-slate-500">{identifier}</div>
										</div>
									</CardHeader>
									<CardContent className="text-sm pt-4">
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											<div>
												Config Path:{" "}
												<span className="font-mono break-all">
													{configDetails.config_path}
												</span>
											</div>
											<div>
												Managed: {String((configDetails as any).managed)}
											</div>
											<div>
												Servers detected: {configDetails.mcp_servers_count ?? 0}
											</div>
											<div>
												Last Modified: {configDetails.last_modified || "-"}
											</div>
										</div>
									</CardContent>
								</>
							) : (
								<CardContent className="text-sm text-slate-500">
									No details available
								</CardContent>
							)}
						</Card>
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle>Configured Servers (preview)</CardTitle>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => importPreviewMutation.mutate()}
										>
											<Eye className="mr-2 h-4 w-4" /> Import from Config
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
												className="h-8 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"
											/>
										))}
									</div>
								) : currentServers.length ? (
									<ul className="list-disc pl-6 text-sm">
										{currentServers.map((n) => (
											<li key={n}>{n}</li>
										))}
									</ul>
								) : (
									<div className="text-sm text-slate-500">
										No servers extracted from current config.
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				<TabsContent value="backups">
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle>Backups</CardTitle>
								<div className="flex items-center gap-2">
									{!loadingBackups && visibleBackups.length > 0 && (
										<>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setSelectedBackups(
														visibleBackups.map((b) => b.backup),
													)
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
										</>
									)}
									<Button
										variant="outline"
										onClick={() => refetchBackups()}
										disabled={loadingBackups}
										size="sm"
									>
										<RefreshCw
											className={`mr-2 h-4 w-4 ${loadingBackups ? "animate-spin" : ""}`}
										/>
										Refresh
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
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
								<div className="space-y-2">
									{visibleBackups.map((b) => {
										const selected = selectedBackups.includes(b.backup);
										return (
											<div
												key={b.path}
												className={`flex items-center justify-between rounded border p-3 text-sm cursor-pointer hover:bg-accent/50 ${selected ? "bg-accent/50 ring-1 ring-primary/40" : ""}`}
												onClick={() =>
													setSelectedBackups((prev) =>
														prev.includes(b.backup)
															? prev.filter((x) => x !== b.backup)
															: [...prev, b.backup],
													)
												}
											>
												<div className="space-y-0.5">
													<div className="font-mono">{b.backup}</div>
													<div className="text-slate-500">
														{b.created_at || "-"} • {(b.size / 1024).toFixed(1)}{" "}
														KB
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Button
														size="sm"
														onClick={(e) => {
															e.stopPropagation();
															setConfirm({ kind: "restore", backup: b.backup });
														}}
													>
														<RotateCcw className="mr-2 h-4 w-4" />
														Restore
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={(e) => {
															e.stopPropagation();
															setConfirm({ kind: "delete", backup: b.backup });
														}}
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</Button>
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className="text-slate-500 text-sm">No backups.</div>
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

			{/* Apply Config Drawer */}
			<Drawer
				open={applyOpen}
				onOpenChange={(o) => {
					setApplyOpen(o);
					if (!o) setApplyResult(null);
				}}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Apply Configuration</DrawerTitle>
						<DrawerDescription>
							Apply or preview configuration for this client.
						</DrawerDescription>
					</DrawerHeader>
					<div className="p-4 space-y-4">
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1">
								<Label>Preview</Label>
								<div className="flex items-center gap-2">
									<Switch checked={preview} onCheckedChange={setPreview} />
									<span className="text-xs text-slate-500">
										Only generate preview
									</span>
								</div>
							</div>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={() => applyMutation.mutate()}
								disabled={applyMutation.isPending}
							>
								<Upload className="mr-2 h-4 w-4" />
								{preview ? "Preview" : "Apply"}
							</Button>
							<Button
								variant="outline"
								onClick={() => refetchDetails()}
								disabled={loadingConfig}
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Refresh
							</Button>
						</div>
						{preview && (
							<div className="rounded border p-3 text-sm">
								<div className="font-medium mb-2">Preview Result</div>
								{applyMutation.isPending ? (
									<div className="h-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
								) : applyResult ? (
									<div className="space-y-4 text-xs">
										<div className="grid gap-2 sm:grid-cols-3">
											<div>format: {applyResult.diff_format || "-"}</div>
											<div>warnings: {applyResult.warnings?.length ?? 0}</div>
											<div>
												scheduled: {applyResult.scheduled ? "true" : "false"}
											</div>
										</div>
										{applyResult.warnings && applyResult.warnings.length > 0 ? (
											<ul className="list-disc pl-4 text-amber-600 dark:text-amber-400">
												{applyResult.warnings.map((w) => (
													<li key={w}>{w}</li>
												))}
											</ul>
										) : null}
										{applyResult.preview ? (
											<details
												className="rounded border bg-slate-50 dark:bg-slate-900 p-2"
												open
											>
												<summary className="cursor-pointer text-slate-600 dark:text-slate-300">
													Rendered preview payload
												</summary>
												<pre className="mt-2 whitespace-pre-wrap break-all">
													{JSON.stringify(applyResult.preview, null, 2)}
												</pre>
											</details>
										) : null}
										{applyResult.diff_before || applyResult.diff_after ? (
											<div className="grid gap-3 lg:grid-cols-2">
												{applyResult.diff_before ? (
													<div>
														<div className="mb-1 font-medium text-slate-600 dark:text-slate-200">
															Before
														</div>
														<pre className="h-40 overflow-auto rounded border bg-slate-50 dark:bg-slate-900 p-2 whitespace-pre">
															{applyResult.diff_before}
														</pre>
													</div>
												) : null}
												{applyResult.diff_after ? (
													<div>
														<div className="mb-1 font-medium text-slate-600 dark:text-slate-200">
															After
														</div>
														<pre className="h-40 overflow-auto rounded border bg-slate-50 dark:bg-slate-900 p-2 whitespace-pre">
															{applyResult.diff_after}
														</pre>
													</div>
												) : null}
											</div>
										) : null}
									</div>
								) : (
									<div className="text-xs text-slate-500">No preview yet.</div>
								)}
							</div>
						)}
					</div>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>

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
					<div className="p-4 space-y-4 text-sm">
						{importPreviewMutation.isPending ? (
							<div className="h-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
						) : importPreviewData ? (
							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-2">
									<div>
										attempted:{" "}
										{String(importPreviewData.summary?.attempted ?? "-")}
									</div>
									<div>
										imported: {importPreviewData.summary?.imported_count ?? 0}
									</div>
									<div>
										skipped: {importPreviewData.summary?.skipped_count ?? 0}
									</div>
									<div>
										failed: {importPreviewData.summary?.failed_count ?? 0}
									</div>
								</div>
								{Array.isArray(importPreviewData.items) &&
								importPreviewData.items.length > 0 ? (
									<div className="rounded border">
										<div className="px-3 py-2 text-xs text-slate-500 border-b">
											Servers to import
										</div>
										<ul className="divide-y">
											{importPreviewData.items.map((it: any, idx: number) => (
												<li key={idx} className="p-3 text-xs">
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
										<pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto">
											{JSON.stringify(
												importPreviewData.summary.errors,
												null,
												2,
											)}
										</pre>
									</details>
								) : null}
								<details className="mt-2">
									<summary className="text-xs text-slate-500 cursor-pointer">
										Raw preview JSON
									</summary>
									<pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto">
										{JSON.stringify(importPreviewData, null, 2)}
									</pre>
								</details>
							</div>
						) : (
							<div className="text-slate-500">No preview data.</div>
						)}
						<div className="flex gap-2 mt-2">
							<Button
								onClick={() => importMutation.mutate()}
								disabled={importMutation.isPending}
							>
								Apply Import
							</Button>
							<Button
								variant="outline"
								onClick={() => setImportPreviewOpen(false)}
							>
								Close
							</Button>
						</div>
					</div>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>
		</div>
	);
}

export default ClientDetailPage;
