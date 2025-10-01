import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, Plus, RefreshCw, ToggleLeft } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EntityCard } from "../../components/entity-card";
import { EntityListItem } from "../../components/entity-list-item";
import { ListGridContainer } from "../../components/list-grid-container";
import { EmptyState, PageLayout } from "../../components/page-layout";
import { StatsCards } from "../../components/stats-cards";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageToolbar } from "../../components/ui/page-toolbar";
import { Switch } from "../../components/ui/switch";
import { clientsApi } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../lib/notify";
import { useAppStore } from "../../lib/store";
import React from "react";

export function ClientsPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);
	const { defaultView, setDashboardSetting } = useAppStore((state) => ({
		defaultView: state.dashboardSettings.defaultView,
		setDashboardSetting: state.setDashboardSetting,
	}));

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
	// 转换数据格式以适配 Entity 接口，保持引用稳定
	const clientsAsEntities = React.useMemo(
		() =>
			clients.map((client: any) => ({
				id: client.identifier || client.display_name || "",
				name: client.display_name || client.identifier || "",
				description: client.description || "",
				...client,
			})),
		[clients],
	);

	// 排序后的数据状态
	const [sortedClients, setSortedClients] = React.useState(clientsAsEntities);

	// 同步最新数据源
	React.useEffect(() => {
		setSortedClients(clientsAsEntities);
	}, [clientsAsEntities]);
	const [search, setSearch] = React.useState("");

	// 计算统计信息
	const stats = React.useMemo(() => {
		const total = clientsAsEntities.length;
		const filtered = sortedClients.length;
		const showing = filtered;
		return { total, filtered, showing };
	}, [clientsAsEntities.length, sortedClients.length]);

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
			<EntityListItem
				key={client.identifier}
				id={client.identifier}
				title={displayName}
				description={description}
				avatar={{
					src: client.logo_url,
					alt: displayName,
					fallback: avatarInitial,
				}}
				stats={[{ label: "Config", value: configPath }]}
				bottomTags={[<span key="servers">Servers: {serverCount}</span>]}
				statusBadge={
					client.detected ? (
						<span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
							<Check className="mr-1 h-3 w-3" /> Detected
						</span>
					) : (
						<Badge variant="secondary">Not Detected</Badge>
					)
				}
				enableSwitch={{
					checked: client.managed,
					onChange: (checked) =>
						manageMutation.mutate({ identifier, managed: checked }),
					disabled: manageMutation.isPending,
				}}
				onClick={() => navigate(`/clients/${encodeURIComponent(identifier)}`)}
			/>
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
			<EntityCard
				key={`client-card-${identifier}`}
				id={identifier}
				title={displayName}
				description={description}
				avatar={{
					src: client.logo_url,
					alt: displayName,
					fallback: avatarInitial,
				}}
				avatarShape="rounded"
				stats={statItems}
				bottomLeft={
					<div className="flex flex-wrap items-center gap-2">
						{detectedBadge}
						{quickLinks.map((link) => (
							<button
								key={`${identifier}-${link.label}`}
								type="button"
								className="inline-flex items-center justify-center rounded-full border border-transparent bg-transparent h-5 w-5 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-slate-500 dark:hover:text-slate-300"
								onClick={(event) => handleQuickLink(event, link.url!)}
								title={link.label}
							>
								<link.icon className="w-4" />
								<span className="sr-only">{link.label}</span>
							</button>
						))}
					</div>
				}
				bottomRight={
					<Switch
						checked={client.managed}
						onCheckedChange={(checked) =>
							manageMutation.mutate({ identifier, managed: checked })
						}
						onClick={(e) => e.stopPropagation()}
						disabled={manageMutation.isPending}
					/>
				}
				onClick={() => navigate(`/clients/${encodeURIComponent(identifier)}`)}
			/>
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
					<Card key={`client-skeleton-grid-${index}`} className="p-4">
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
									key={`client-skeleton-stat-grid-${index}-${sIdx}`}
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

	// 展开状态
	const [expanded, setExpanded] = useState(false);

	// 工具栏配置
	const toolbarConfig = {
		data: clientsAsEntities,
		search: {
			placeholder: "Search clients...",
			fields: [
				{ key: "display_name", label: "Display Name", weight: 10 },
				{ key: "identifier", label: "Identifier", weight: 8 },
				{ key: "description", label: "Description", weight: 5 },
			],
			debounceMs: 300,
		},
		viewMode: {
			enabled: true,
			defaultMode: defaultView as "grid" | "list",
		},
		sort: {
			enabled: true,
			options: [
				{
					value: "display_name",
					label: "Name",
					defaultDirection: "asc" as const,
				},
				{
					value: "detected",
					label: "Detection Status",
					defaultDirection: "desc" as const,
				},
				{
					value: "managed",
					label: "Management Status",
					defaultDirection: "desc" as const,
				},
			],
			defaultSort: "display_name",
		},
	};

	// 工具栏状态
	const toolbarState = {
		search,
		viewMode: defaultView,
		sort: "display_name", // 添加必需的 sort 属性
		expanded,
	};

	// 工具栏回调
	const toolbarCallbacks = {
		onSearchChange: setSearch,
		onViewModeChange: (mode: "grid" | "list") => {
			// 直接更新全局设置
			setDashboardSetting("defaultView", mode);
		},
		onSortedDataChange: setSortedClients,
		onExpandedChange: setExpanded,
	};

	// 操作按钮
	const actions = (
		<div className="flex items-center gap-2">
			<Button
				onClick={handleRefresh}
				disabled={isRefetching || refreshing}
				variant="outline"
				size="sm"
				className="h-9 w-9 p-0"
				onMouseUp={() =>
					notifyInfo(
						"Refresh triggered",
						"Latest client state will sync to the list",
					)
				}
				title="Refresh"
			>
				<RefreshCw
					className={`h-4 w-4 ${isRefetching || refreshing ? "animate-spin" : ""}`}
				/>
			</Button>
			<Button
				size="sm"
				className="h-9 w-9 p-0"
				onClick={() =>
					notifyInfo(
						"Feature in Development",
						"This feature is being implemented, please stay tuned",
					)
				}
				title="Add Client"
			>
				<Plus className="h-4 w-4" />
			</Button>
		</div>
	);

	return (
		<PageLayout
			title="Clients"
			headerActions={
				<PageToolbar
					config={toolbarConfig}
					state={toolbarState}
					callbacks={toolbarCallbacks}
					actions={actions}
				/>
			}
			statsCards={<StatsCards cards={statsCards} />}
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

			{/* 统计信息 - 移到页面底部 */}
			<div className="text-xs text-slate-500 dark:text-slate-400 mt-4 text-center">
				Showing {stats.showing} of {stats.filtered} clients (Total:{" "}
				{stats.total})
			</div>
		</PageLayout>
	);
}

export default ClientsPage;
