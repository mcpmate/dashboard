import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, Settings, ToggleLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "../../components/ui/avatar";
import { clientsApi } from "../../lib/api";

export function ClientsPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);

	const { data, isLoading, isRefetching, refetch } = useQuery({
		queryKey: ["clients"],
		queryFn: async () => {
			const resp = await clientsApi.list(false);
			return resp;
		},
		staleTime: 10_000,
	});

	const clients = data?.client ?? [];
	const detectedCount = clients.filter((c: any) => !!c.detected).length;
	const managedCount = clients.filter((c: any) => !!c.managed).length;
	const configuredCount = clients.filter((c: any) => !!c.has_mcp_config).length;
	// Stable, user-friendly ordering: by display_name then identifier; not by status
	const sortedClients = useMemo(() => {
		const arr = [...clients];
		arr.sort((a, b) => {
			const an = (a.display_name || "").toLowerCase();
			const bn = (b.display_name || "").toLowerCase();
			if (an < bn) return -1;
			if (an > bn) return 1;
			const ai = (a.identifier || "").toLowerCase();
			const bi = (b.identifier || "").toLowerCase();
			if (ai < bi) return -1;
			if (ai > bi) return 1;
			return 0;
		});
		return arr;
	}, [clients]);

	const manageMutation = useMutation({
		mutationFn: async ({
			identifier,
			managed,
		}: {
			identifier: string;
			managed: boolean;
		}) => {
			const result = await clientsApi.manage(
				identifier,
				managed ? "enable" : "disable",
			);
			return result;
		},
		onSuccess: async () => {
			try {
				// Force backend to refresh detection/config state, then sync cache
				const fresh = await clientsApi.list(true);
				qc.setQueryData(["clients"], fresh as any);
			} catch {
				/* noop */
			}
			qc.invalidateQueries({ queryKey: ["clients"] });
			notifySuccess("Updated", "Client management state updated");
		},
		onError: (err) => notifyError("Operation failed", String(err)),
	});

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			await clientsApi.list(true);
		} catch {
			/* noop */
		}
		await refetch();
		setRefreshing(false);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold tracking-tight">Clients</h2>
				<div className="flex gap-2">
					<Button
						onClick={handleRefresh}
						disabled={isRefetching || refreshing}
						variant="outline"
						size="sm"
						onMouseUp={() =>
							notifyInfo(
								"Refresh triggered",
								"Latest client state will sync to the list",
							)
						}
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${isRefetching || refreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
			</div>

			{/* Summary cards */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Total Clients</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{clients.length}</div>
						<CardDescription>discovered</CardDescription>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Detected</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{detectedCount}/{clients.length}
						</div>
						<CardDescription>installed</CardDescription>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Managed</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{managedCount}</div>
						<CardDescription>management enabled</CardDescription>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Configured</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{configuredCount}</div>
						<CardDescription>has MCP config</CardDescription>
					</CardContent>
				</Card>
			</div>

			{isLoading ? (
				<div className="space-y-4">
					{[1, 2, 3].map((n) => (
						<div
							key={n}
							className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
						>
							<div className="space-y-1">
								<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								<div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
							</div>
							<div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
						</div>
					))}
				</div>
			) : sortedClients.length > 0 ? (
				<div className="space-y-4">
					{sortedClients.map((c) => (
						<div
							key={c.identifier}
							className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 cursor-pointer transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950"
							role="button"
							tabIndex={0}
							onClick={(e) => {
								const target = e.target as HTMLElement;
								if (target.closest("button, a, input, [role='switch']")) return;
								navigate(`/clients/${encodeURIComponent(c.identifier)}`);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									navigate(`/clients/${encodeURIComponent(c.identifier)}`);
								}
							}}
						>
							<div className="flex items-center gap-3">
								<Avatar className="h-12 w-12">
									{c.logo_url ? (
										<AvatarImage
											src={c.logo_url}
											alt={c.display_name || c.identifier}
										/>
									) : null}
									<AvatarFallback>
										{(c.display_name || c.identifier || "C")
											.slice(0, 1)
											.toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<h3 className="font-medium text-sm">{c.display_name}</h3>
										{c.detected ? (
											<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
												<Check className="mr-1 h-3 w-3" /> Detected
											</span>
										) : (
											<Badge variant="secondary">Not Detected</Badge>
										)}
										{c.has_mcp_config ? (
											<Badge>Configured</Badge>
										) : (
											<Badge variant="outline">No Config</Badge>
										)}
									</div>
									<p className="text-sm text-slate-500">{c.identifier}</p>
									<div className="flex items-center gap-4 text-xs text-slate-400">
										<span>Servers: {c.mcp_servers_count ?? 0}</span>
										<span>Config: {c.config_path}</span>
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Switch
									checked={c.managed}
									onCheckedChange={(checked) =>
										manageMutation.mutate({
											identifier: c.identifier,
											managed: checked,
										})
									}
									onClick={(e) => e.stopPropagation()}
									disabled={manageMutation.isPending}
								/>
								<Link
									to={`/clients/${encodeURIComponent(c.identifier)}`}
									onClick={(e) => e.stopPropagation()}
								>
									<Button size="sm" variant="outline">
										<Settings className="mr-2 h-4 w-4" />
										Details
									</Button>
								</Link>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="text-center py-8">
					<ToggleLeft className="mx-auto h-12 w-12 text-slate-400 mb-4" />
					<p className="text-slate-500 mb-2">No clients found</p>
					<p className="text-sm text-slate-400">
						Make sure MCPMate backend is running and detection is enabled
					</p>
				</div>
			)}

			{/* Details moved to dedicated page */}
		</div>
	);
}

export default ClientsPage;
