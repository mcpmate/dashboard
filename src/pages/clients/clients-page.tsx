import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, RefreshCw, ToggleLeft } from "lucide-react";
import { type MouseEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Switch } from "../../components/ui/switch";
import {
	PageLayout,
	StatsCard,
	EmptyState,
} from "../../components/page-layout";
import { ListGridContainer } from "../../components/list-grid-container";
import { clientsApi } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import { useAppStore } from "../../lib/store";

export function ClientsPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);
	const defaultView = useAppStore(
		(state) => state.dashboardSettings.defaultView,
	);

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

	const renderClientListItem = (client: any) => {
		const displayName = client.display_name || client.identifier || "Client";
		const identifier = client.identifier || "—";
		const avatarInitial =
			(displayName.trim() || identifier).charAt(0).toUpperCase() || "C";
		const serverCount = client.mcp_servers_count ?? 0;
		const configPath = client.config_path || "Not configured";
		const description =
			client.description ?? client.template?.description ?? "";

		return (
			<div
				key={client.identifier}
				className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 cursor-pointer shadow-[0_4px_12px_-10px_rgba(15,23,42,0.2)] transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_4px_12px_-10px_rgba(15,23,42,0.5)]"
				role="button"
				tabIndex={0}
				onClick={(e) => {
					const target = e.target as HTMLElement;
					if (target.closest("button, a, input, [role='switch']")) return;
					navigate(`/clients/${encodeURIComponent(identifier)}`);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						navigate(`/clients/${encodeURIComponent(identifier)}`);
					}
				}}
			>
				<div className="flex items-center gap-3">
					<Avatar className="h-11 w-11 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
						{client.logo_url ? (
							<AvatarImage src={client.logo_url} alt={displayName} />
						) : null}
						<AvatarFallback>{avatarInitial}</AvatarFallback>
					</Avatar>
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-medium text-sm leading-tight">
								{displayName}
							</h3>
							{client.detected ? (
								<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
									<Check className="mr-1 h-3 w-3" /> Detected
								</span>
							) : (
								<Badge variant="secondary">Not Detected</Badge>
							)}
						</div>
						<div className="flex flex-col gap-1 text-xs text-slate-400">
							{description ? (
								<span className="max-w-xl text-slate-500 line-clamp-2">
									{description}
								</span>
							) : null}
							<span className="truncate" title={configPath}>
								Config: {configPath}
							</span>
							<span>Servers: {serverCount}</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={client.managed}
						onCheckedChange={(checked) =>
							manageMutation.mutate({ identifier, managed: checked })
						}
						onClick={(e) => e.stopPropagation()}
						disabled={manageMutation.isPending}
					/>
				</div>
			</div>
		);
	};

	const renderClientCard = (client: any) => {
		const displayName = client.display_name || client.identifier || "Client";
		const identifier = client.identifier || "—";
		const avatarInitial =
			(displayName.trim() || identifier).charAt(0).toUpperCase() || "C";
		const description =
			client.description ?? client.template?.description ?? "";
		const homepageUrl =
			client.homepage_url ?? client.template?.homepage_url ?? null;
		const statItems = [
			{ label: "Servers", value: (client.mcp_servers_count ?? 0).toString() },
			{ label: "Managed", value: client.managed ? "On" : "Off" },
			{ label: "Detected", value: client.detected ? "Yes" : "No" },
			{ label: "Config", value: client.has_mcp_config ? "Present" : "Missing" },
		];
		const detectedBadge = client.detected ? (
			<Badge variant="default">Detected</Badge>
		) : (
			<Badge variant="secondary">Not Detected</Badge>
		);
		const quickLinks = (
			[{ label: "Homepage", url: homepageUrl, icon: Globe }] as const
		).filter((link) => !!link.url);

		const handleQuickLink = (event: MouseEvent, url: string) => {
			event.stopPropagation();
			if (!url) return;
			try {
				window.open(url, "_blank", "noopener,noreferrer");
			} catch {
				/* noop */
			}
		};

		return (
			<Card
				key={`client-card-${identifier}`}
				className="group flex h-full cursor-pointer flex-col overflow-hidden border border-slate-200 transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800"
				role="button"
				tabIndex={0}
				onClick={() => navigate(`/clients/${encodeURIComponent(identifier)}`)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						navigate(`/clients/${encodeURIComponent(identifier)}`);
					}
				}}
			>
				<CardHeader className="p-4 pb-2 space-y-3">
					<div className="flex items-start gap-3">
						<Avatar className="h-12 w-12 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-lg font-semibold">
							{client.logo_url ? (
								<AvatarImage src={client.logo_url} alt={displayName} />
							) : null}
							<AvatarFallback>{avatarInitial}</AvatarFallback>
						</Avatar>
						<div className="space-y-2">
							<CardTitle className="text-lg font-semibold leading-tight">
								{displayName}
							</CardTitle>
							<div className="min-h-[2.5rem]">
								{description ? (
									<CardDescription className="text-sm leading-snug text-muted-foreground line-clamp-2">
										{description}
									</CardDescription>
								) : (
									<CardDescription
										className="text-sm leading-snug opacity-0 select-none"
										aria-hidden="true"
									>
										placeholder
									</CardDescription>
								)}
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-2">
					<div className="grid grid-cols-4 gap-x-6 gap-y-1">
						{statItems.map((item) => (
							<span
								key={`client-label-${identifier}-${item.label}`}
								className="text-xs uppercase tracking-wide text-muted-foreground/80"
							>
								{item.label}
							</span>
						))}
						{statItems.map((item) => (
							<span
								key={`client-value-${identifier}-${item.label}`}
								className="text-sm font-semibold text-slate-900 dark:text-slate-100"
							>
								{item.value}
							</span>
						))}
					</div>
				</CardContent>
				<CardFooter className="flex items-center justify-between gap-2 px-4 pb-4 pt-0">
					<div className="flex flex-wrap items-center gap-2">
						{detectedBadge}
						{quickLinks.map((link) => (
							<Button
								key={`${identifier}-${link.label}`}
								size="icon"
								variant="ghost"
								onClick={(event) => handleQuickLink(event, link.url!)}
								title={link.label}
							>
								<link.icon className="w-4" />
								<span className="sr-only">{link.label}</span>
							</Button>
						))}
					</div>
					<Switch
						checked={client.managed}
						onCheckedChange={(checked) =>
							manageMutation.mutate({ identifier, managed: checked })
						}
						onClick={(e) => e.stopPropagation()}
						disabled={manageMutation.isPending}
					/>
				</CardFooter>
			</Card>
		);
	};

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

	// Prepare stats cards data
	const statsCards = [
		{
			title: "Total Clients",
			value: clients.length,
			description: "discovered",
		},
		{
			title: "Detected",
			value: `${detectedCount}/${clients.length}`,
			description: "installed",
		},
		{
			title: "Managed",
			value: managedCount,
			description: "management enabled",
		},
		{
			title: "Configured",
			value: configuredCount,
			description: "has MCP config",
		},
	];

	// Prepare loading skeleton
	const loadingSkeleton =
		defaultView === "grid"
			? Array.from({ length: 6 }, (_, index) => (
					<Card key={`client-skeleton-${index}`} className="p-4">
						<div className="flex items-start gap-3">
							<div className="h-12 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
							<div className="flex-1 space-y-2">
								<div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								<div className="h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
							</div>
						</div>
						<div className="mt-4 grid grid-cols-2 gap-3">
							{Array.from({ length: 4 }, (__, sIdx) => (
								<div
									key={`client-skeleton-stat-${index}-${sIdx}`}
									className="space-y-2"
								>
									<div className="h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
									<div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								</div>
							))}
						</div>
					</Card>
				))
			: Array.from({ length: 3 }, (_, index) => (
					<div
						key={`client-skeleton-list-${index}`}
						className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950"
					>
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
							<div className="space-y-2">
								<div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
								<div className="h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
							</div>
						</div>
						<div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
					</div>
				));

	// Prepare empty state
	const emptyState = (
		<Card>
			<CardContent className="flex flex-col items-center justify-center p-6">
				<EmptyState
					icon={<ToggleLeft className="h-12 w-12" />}
					title="No clients found"
					description="Make sure MCPMate backend is running and detection is enabled"
				/>
			</CardContent>
		</Card>
	);

	return (
		<PageLayout
			title="Clients"
			headerActions={
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
			}
			statsCards={statsCards.map((stat) => (
				<StatsCard
					key={stat.title}
					title={stat.title}
					value={stat.value}
					description={stat.description}
				/>
			))}
		>
			<ListGridContainer
				loading={isLoading}
				loadingSkeleton={loadingSkeleton}
				emptyState={sortedClients.length === 0 ? emptyState : undefined}
			>
				{defaultView === "grid"
					? sortedClients.map((client) => renderClientCard(client))
					: sortedClients.map((client) => renderClientListItem(client))}
			</ListGridContainer>
		</PageLayout>
	);
}

export default ClientsPage;
