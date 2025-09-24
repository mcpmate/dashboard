import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wrench } from "lucide-react";
import React from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { StatusBadge } from "../../components/status-badge";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { notifyError, notifySuccess } from "../../lib/notify";
import { capabilitiesApi, runtimeApi } from "../../lib/api";
import type {
	CapabilitiesStatsResponse,
	ClearCacheResponse,
	InstallResponse,
	RuntimeCacheResponse,
	RuntimeStatusResponse,
} from "../../lib/types";
import { formatBytes, formatRelativeTime } from "../../lib/utils";

export function RuntimePage() {
	const qc = useQueryClient();
	const [confirm, setConfirm] = React.useState<
		| { type: "resetAll" }
		| { type: "resetOne"; key: "uv" | "bun" }
		| { type: "install"; key: "uv" | "bun" }
		| { type: "capabilitiesReset" }
		| null
	>(null);

	// Queries
	const runtimeStatusQ = useQuery({
		queryKey: ["runtimeStatus"],
		queryFn: runtimeApi.getStatus,
		refetchInterval: 60_000,
	});

	const runtimeCacheQ = useQuery({
		queryKey: ["runtimeCache"],
		queryFn: runtimeApi.getCache,
		refetchInterval: 60_000,
	});

	const capabilitiesStatsQ = useQuery({
		queryKey: ["capabilities", "stats"],
		queryFn: capabilitiesApi.getStats,
		refetchInterval: 60_000,
	});

	// Mutations
	const resetAllM = useMutation<{ success: boolean }, Error, void>({
		mutationFn: async () => runtimeApi.resetCache("all"),
	onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["runtimeCache"] });
			notifySuccess("Caches reset", "All runtime caches cleared.");
			setConfirm(null);
		},
		onError: (e) => notifyError("Reset failed", e.message),
	});

	const resetOneM = useMutation<ClearCacheResponse, Error, "uv" | "bun">({
		mutationFn: async (kind) => runtimeApi.resetCache(kind),
	onSuccess: (_data, kind) => {
			qc.invalidateQueries({ queryKey: ["runtimeCache"] });
			notifySuccess("Cache reset", `${kind.toUpperCase()} cache cleared.`);
			setConfirm(null);
		},
		onError: (e) => notifyError("Reset failed", e.message),
	});

	const installM = useMutation<InstallResponse, Error, "uv" | "bun">({
		mutationFn: async (kind) =>
			runtimeApi.install({ runtime_type: kind, verbose: true }),
	onSuccess: (data, kind) => {
			qc.invalidateQueries({ queryKey: ["runtimeStatus"] });
			notifySuccess("Install complete", `${kind.toUpperCase()}: ${data.message}`);
			setConfirm(null);
		},
		onError: (e) => notifyError("Install failed", e.message),
	});

  // Capabilities cache reset button removed per latest requirement

  const isBusy =
    resetAllM.isPending ||
    resetOneM.isPending ||
    installM.isPending;

	const status = runtimeStatusQ.data as RuntimeStatusResponse | undefined;
	const cache = runtimeCacheQ.data as RuntimeCacheResponse | undefined;
	const capStats = capabilitiesStatsQ.data as
		| CapabilitiesStatsResponse
		| undefined;

	const kinds: Array<"uv" | "bun"> = ["uv", "bun"];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
					Runtime
				</h2>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={isBusy || runtimeCacheQ.isLoading}
						onClick={() => setConfirm({ type: "resetAll" })}
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${resetAllM.isPending ? "animate-spin" : ""}`}
						/>
						Reset All Caches
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Overview</CardTitle>
				</CardHeader>
				<CardContent>
					{runtimeStatusQ.isLoading || runtimeCacheQ.isLoading ? (
						<div className="space-y-2">
							{[0, 1].map((i) => (
								<div
									key={i}
									className="flex items-center justify-between rounded-md border p-3"
								>
									<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							))}
						</div>
					) : (
						<div className="grid gap-4 md:grid-cols-2">
							{kinds.map((key) => {
								const st = status?.[key];
								const c = cache?.[key];
								const statusStr = st?.available ? "running" : "stopped";
								const p = st?.path ? st.path.replace(/\\/g, "/") : "";
								const folder = p.includes("/")
									? p.slice(0, p.lastIndexOf("/"))
									: "";

								return (
									<div key={key} className="rounded-md border p-4">
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<Wrench className="h-4 w-4 text-slate-500" />
												<div className="font-semibold uppercase">{key}</div>
											</div>
											<StatusBadge status={statusStr} />
										</div>

										<div className="space-y-1 text-sm">
											<div className="flex items-center justify-between">
												<span className="text-slate-500">Version</span>
												<span>{st?.version || "N/A"}</span>
											</div>
											{folder ? (
												<div className="flex items-center justify-between">
													<span className="text-slate-500">Folder</span>
													<span className="truncate max-w-[60%]" title={folder}>
														{folder}
													</span>
												</div>
											) : null}
											<div className="flex items-center justify-between">
												<span className="text-slate-500">Message</span>
												<span
													className="truncate max-w-[60%]"
													title={st?.message || ""}
												>
													{st?.message || "—"}
												</span>
											</div>

											<div className="mt-3 font-medium">Cache</div>
											<div className="flex items-center justify-between">
												<span className="text-slate-500">Size</span>
												<span>{formatBytes(c?.size_bytes || 0)}</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-slate-500">Packages</span>
												<span>{c?.package_count ?? 0}</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-slate-500">Last Modified</span>
												<span>
													{c?.last_modified
														? formatRelativeTime(c.last_modified)
														: "—"}
												</span>
											</div>
										</div>

										<div className="mt-4 flex items-center gap-2">
											<Button
												size="sm"
												disabled={installM.isPending}
												onClick={() => setConfirm({ type: "install", key })}
											>
												<Wrench
													className={`mr-2 h-4 w-4 ${installM.isPending ? "animate-spin" : ""}`}
												/>
												Install / Repair
											</Button>
											<Button
												variant="outline"
												size="sm"
												disabled={resetOneM.isPending}
												onClick={() => setConfirm({ type: "resetOne", key })}
											>
												<RefreshCw
													className={`mr-2 h-4 w-4 ${resetOneM.isPending ? "animate-spin" : ""}`}
												/>
												Reset Cache
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Capabilities Cache */}
			<Card>
				<CardHeader>
					<CardTitle>Capabilities Cache</CardTitle>
				</CardHeader>
				<CardContent>
					{capabilitiesStatsQ.isLoading ? (
						<div className="space-y-2">
							<div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
							<div className="h-5 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
						</div>
					) : capStats ? (
						<div className="space-y-3 text-sm">
							<div className="grid gap-2 md:grid-cols-2">
								<div className="flex items-center justify-between">
									<span className="text-slate-500">DB Path</span>
									<span
										className="truncate max-w-[60%]"
										title={capStats?.storage?.db_path || ""}
									>
										{capStats?.storage?.db_path || "—"}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Cache Size</span>
									<span>{formatBytes(capStats.storage.cache_size_bytes)}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Last Cleanup</span>
									<span>
										{capStats.storage.last_cleanup
											? formatRelativeTime(capStats.storage.last_cleanup)
											: "—"}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Generated</span>
									<span>{formatRelativeTime(capStats.generatedAt)}</span>
								</div>
							</div>

							<div className="mt-2 grid gap-2 md:grid-cols-3">
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Servers</span>
									<span>{capStats.storage.tables.servers}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Tools</span>
									<span>{capStats.storage.tables.tools}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Resources</span>
									<span>{capStats.storage.tables.resources}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Prompts</span>
									<span>{capStats.storage.tables.prompts}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Resource Templates</span>
									<span>{capStats.storage.tables.resourceTemplates}</span>
								</div>
							</div>

							<div className="mt-4 grid gap-2 md:grid-cols-3">
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Total Queries</span>
									<span>{capStats.metrics.totalQueries}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Cache Hits</span>
									<span>{capStats.metrics.cacheHits}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Cache Misses</span>
									<span>{capStats.metrics.cacheMisses}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Hit Ratio</span>
									<span>{capStats.metrics.hitRatio.toFixed(2)}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Reads</span>
									<span>{capStats.metrics.readOperations}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Writes</span>
									<span>{capStats.metrics.writeOperations}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-slate-500">Invalidations</span>
									<span>{capStats.metrics.cacheInvalidations}</span>
								</div>
							</div>

                  {/* Reset Capabilities button removed as requested */}
						</div>
					) : (
						<p className="text-sm text-slate-500">No data.</p>
					)}
				</CardContent>
			</Card>
			{/* Global confirmation dialog */}
        <ConfirmDialog
          isOpen={confirm !== null}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (!confirm) return;
            if (confirm.type === "resetAll") {
              resetAllM.mutate();
            } else if (confirm.type === "resetOne") {
              resetOneM.mutate(confirm.key);
            } else if (confirm.type === "install") {
              installM.mutate(confirm.key);
            }
          }}
          title={
            confirm?.type === "resetAll"
              ? "Reset all runtime caches?"
              : confirm?.type === "resetOne"
                ? `Reset ${confirm.key.toUpperCase()} cache?`
                : confirm?.type === "install"
                  ? `Install/Repair ${confirm.key.toUpperCase()} runtime?`
                  : "Confirm"
          }
          description={
            confirm?.type === "resetAll"
              ? "This will clear all runtime caches. Continue?"
              : confirm?.type === "resetOne"
                ? `This will clear ${confirm.key.toUpperCase()} cache. Continue?`
                : confirm?.type === "install"
                  ? `This will install or repair ${confirm.key.toUpperCase()} on the server. Continue?`
                  : ""
          }
          confirmLabel={
            confirm?.type === "install" ? "Install / Repair" : "Confirm"
          }
          cancelLabel="Cancel"
          variant={confirm?.type === "install" ? "default" : "destructive"}
          isLoading={
            confirm?.type === "resetAll"
              ? resetAllM.isPending
              : confirm?.type === "resetOne"
                ? resetOneM.isPending
                : confirm?.type === "install"
                  ? installM.isPending
                  : false
          }
        />
		</div>
	);
}

export default RuntimePage;
