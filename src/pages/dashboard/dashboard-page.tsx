import { useQuery } from "@tanstack/react-query";
import { Activity, Server, Sliders, Wrench } from "lucide-react";
import React from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { StatusBadge } from "../../components/status-badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import {
	configApi,
	serversApi,
	systemApi,
	toolsApi,
} from "../../lib/api";
import { formatUptime } from "../../lib/utils";

// Maintain a lightweight metrics history in component state
function useMetricsHistory() {
	const [history, setHistory] = React.useState<
		{ time: string; cpu: number; memory: number; connections: number }[]
	>([]);

	const metricsQuery = useQuery({
		queryKey: ["systemMetrics"],
		queryFn: systemApi.getMetrics,
		refetchInterval: 10000,
	});

	React.useEffect(() => {
		const m = metricsQuery.data;
		if (!m) return;
		const ts = m.timestamp ? new Date(m.timestamp) : new Date();
		const point = {
			time: ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
			cpu: typeof m.cpu_usage_percent === "number" ? m.cpu_usage_percent : 0,
			memory:
				typeof m.memory_usage_bytes === "number"
					? m.memory_usage_bytes / (1024 * 1024)
					: 0, // MB
			connections:
				typeof m.active_connections === "number" ? m.active_connections : 0,
		};
		setHistory((prev) => {
			const next = [...prev, point];
			// keep last 24 points (~4 minutes at 10s interval) to avoid heavy UI
			return next.slice(-24);
		});
	}, [metricsQuery.data]);

	return { history, isLoading: metricsQuery.isLoading };
}

export function DashboardPage() {

	const { data: systemStatus, isLoading: isLoadingSystem } = useQuery({
		queryKey: ["systemStatus"],
		queryFn: systemApi.getStatus,
		refetchInterval: 30000,
	});

	const { data: servers, isLoading: isLoadingServers } = useQuery({
		queryKey: ["servers"],
		queryFn: serversApi.getAll,
		refetchInterval: 30000,
	});

	const { data: tools, isLoading: isLoadingTools } = useQuery({
		queryKey: ["tools"],
		queryFn: toolsApi.getAll,
		refetchInterval: 30000,
	});

	// Runtime card removed on Dashboard

	// Metrics history for chart
	const { history: metricsHistory } = useMetricsHistory();

	const { data: currentConfig, isLoading: isLoadingConfig } = useQuery({
		queryKey: ["currentConfig"],
		queryFn: configApi.getCurrentConfig,
		refetchInterval: 30000,
		// Don't retry too many times for config API since we have fallback
		retry: 1,
	});

	const connectedServers =
		servers?.servers?.filter((server) => server.status === "connected")
			.length || 0;
	const enabledTools =
		tools?.tools?.filter((tool) => tool.is_enabled).length || 0;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">System Status</CardTitle>
						<Activity className="h-4 w-4 text-slate-500" />
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<CardDescription>Status</CardDescription>
								{isLoadingSystem ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<StatusBadge status={systemStatus?.status || "unknown"} />
								)}
							</div>
							<div className="flex items-center justify-between">
								<CardDescription>Uptime</CardDescription>
								{isLoadingSystem ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-sm font-medium">
										{formatUptime(systemStatus?.uptime || 0)}
									</span>
								)}
							</div>
							<div className="flex items-center justify-between">
								<CardDescription>Version</CardDescription>
								{isLoadingSystem ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-sm font-medium">
										{systemStatus?.version || "Unknown"}
									</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Current Suit</CardTitle>
						<Sliders className="h-4 w-4 text-slate-500" />
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{isLoadingConfig ? (
								<div className="space-y-2">
									<div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
									<div className="h-5 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								</div>
							) : currentConfig ? (
								<>
									<div className="flex items-center justify-between">
										<CardDescription>Max Connections</CardDescription>
										<span className="text-sm font-medium">
											{currentConfig.global_settings.max_concurrent_connections}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<CardDescription>Log Level</CardDescription>
										<span className="text-sm font-medium">
											{currentConfig.global_settings.log_level}
										</span>
									</div>
								</>
							) : (
								<p className="text-sm text-slate-500">
									No configuration loaded
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Servers</CardTitle>
						<Server className="h-4 w-4 text-slate-500" />
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<CardDescription>Total Servers</CardDescription>
								{isLoadingServers ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-2xl font-bold">
										{servers?.servers?.length || 0}
									</span>
								)}
							</div>
							<div className="flex items-center justify-between">
								<CardDescription>Connected</CardDescription>
								{isLoadingServers ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-2xl font-bold">{connectedServers}</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Tools</CardTitle>
						<Wrench className="h-4 w-4 text-slate-500" />
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<CardDescription>Total Tools</CardDescription>
								{isLoadingTools ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-2xl font-bold">
										{tools?.tools?.length || 0}
									</span>
								)}
							</div>
							<div className="flex items-center justify-between">
								<CardDescription>Enabled</CardDescription>
								{isLoadingTools ? (
									<div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
								) : (
									<span className="text-2xl font-bold">{enabledTools}</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card className="col-span-1 md:col-span-2">
					<CardHeader>
						<CardTitle>System Performance</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px]">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart
									data={metricsHistory}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" stroke="#374151" />
									<XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
									<YAxis stroke="#9ca3af" fontSize={12} />
									<Tooltip
										contentStyle={{
											backgroundColor: "#1f2937",
											border: "1px solid #4b5563",
											borderRadius: "6px",
											color: "#e5e7eb",
										}}
									/>
									<Line
										type="monotone"
										dataKey="cpu"
										stroke="#3b82f6"
										name="CPU (%)"
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 6 }}
									/>
									<Line
										type="monotone"
										dataKey="memory"
										stroke="#10b981"
										name="Memory (MB)"
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 6 }}
									/>
									<Line
										type="monotone"
										dataKey="connections"
										stroke="#f59e0b"
										name="Connections"
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 6 }}
									/>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
