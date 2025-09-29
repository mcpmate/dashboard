import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { serversApi } from "../../lib/api";
import { Button } from "../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import {
	RefreshCw,
	StopCircle,
	PlayCircle,
	RotateCw,
	Shield,
} from "lucide-react";
import { StatusBadge } from "../../components/status-badge";
import { formatRelativeTime } from "../../lib/utils";

export function InstanceDetailPage() {
	const { serverId, instanceId } = useParams<{
		serverId: string;
		instanceId: string;
	}>();

	const {
		data: instance,
		isLoading,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: ["instance", serverId, instanceId],
		queryFn: () => serversApi.getInstance(serverId || "", instanceId || ""),
		enabled: !!serverId && !!instanceId,
		refetchInterval: 10000,
	});

	const { data: serverDetails } = useQuery({
		queryKey: ["serverForInstance", serverId],
		queryFn: () => serversApi.getServer(serverId || ""),
		enabled: !!serverId,
	});

	const { data: health, isLoading: isLoadingHealth } = useQuery({
		queryKey: ["instanceHealth", serverId, instanceId],
		queryFn: () =>
			serversApi.getInstanceHealth(serverId || "", instanceId || ""),
		enabled: !!serverId && !!instanceId,
		refetchInterval: 10000,
	});

	if (!serverId || !instanceId) {
		return <div>Server ID or instance ID not provided</div>;
	}

	const handleDisconnect = () => {
		serversApi.disconnectInstance(serverId, instanceId).then(() => refetch());
	};

	const handleForceDisconnect = () => {
		serversApi
			.forceDisconnectInstance(serverId, instanceId)
			.then(() => refetch());
	};

	const handleReconnect = () => {
		serversApi.reconnectInstance(serverId, instanceId).then(() => refetch());
	};

	const handleResetAndReconnect = () => {
		serversApi
			.resetAndReconnectInstance(serverId, instanceId)
			.then(() => refetch());
	};

	const handleCancel = () => {
		serversApi.cancelInstance(serverId, instanceId).then(() => refetch());
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					<h2
						className="text-2xl font-bold tracking-tight truncate"
						title={serverDetails?.name || serverId}
					>
						<Link
							to={`/servers/${encodeURIComponent(serverId || "")}`}
							className="hover:underline"
						>
							{serverDetails?.name || serverId}
						</Link>
					</h2>
					{!isLoading && instance && (
						<StatusBadge
							status={
								typeof instance.status === "string"
									? instance.status.toLowerCase()
									: "unknown"
							}
							className="ml-3"
						/>
					)}
				</div>
				<Button
					onClick={() => refetch()}
					disabled={isRefetching}
					variant="outline"
					size="sm"
				>
					<RefreshCw
						className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</div>

			{isLoading ? (
				<Card>
					<CardContent className="p-4">
						<div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
					</CardContent>
				</Card>
			) : instance ? (
				<>
					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Instance Details</CardTitle>
							</CardHeader>
							<CardContent>
								<dl className="space-y-2">
									<div className="flex justify-between">
										<dt className="font-medium">Instance ID:</dt>
										<dd className="font-mono text-sm">{instance.id}</dd>
									</div>
									<div className="flex justify-between">
										<dt className="font-medium">Server:</dt>
										<dd>{instance.server_name}</dd>
									</div>
									<div className="flex justify-between">
										<dt className="font-medium">Status:</dt>
										<dd>
											<StatusBadge
												status={
													typeof instance.status === "string"
														? instance.status.toLowerCase()
														: "unknown"
												}
											/>
										</dd>
									</div>
									<div className="flex justify-between">
										<dt className="font-medium">Connection Attempts:</dt>
										<dd>{instance.details.connection_attempts}</dd>
									</div>
									{instance.details.last_connected_seconds !== undefined && (
										<div className="flex justify-between">
											<dt className="font-medium">Connected For:</dt>
											<dd>
												{formatRelativeTime(
													Date.now() -
														instance.details.last_connected_seconds * 1000,
												)}
											</dd>
										</div>
									)}
									{instance.details.tools_count !== undefined && (
										<div className="flex justify-between">
											<dt className="font-medium">Tools:</dt>
											<dd>{instance.details.tools_count}</dd>
										</div>
									)}
									{instance.details.process_id && (
										<div className="flex justify-between">
											<dt className="font-medium">Process ID:</dt>
											<dd>{instance.details.process_id}</dd>
										</div>
									)}
									<div className="flex justify-between">
										<dt className="font-medium">Health:</dt>
										<dd>
											{isLoadingHealth ? (
												<div className="h-5 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
											) : (
												<StatusBadge
													status={
														health?.status === "idle"
															? "idle"
															: health?.healthy
																? "healthy"
																: "unhealthy"
													}
												/>
											)}
										</dd>
									</div>
								</dl>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Instance Controls</CardTitle>
								<CardDescription>
									Manage the instance connection state
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="w-full">
									{instance.status.toLowerCase() === "initializing" ? (
										<div className="flex flex-col gap-3 w-full">
											<Button
												variant="destructive"
												onClick={handleCancel}
												className="w-full"
											>
												<Shield className="mr-2 h-4 w-4" />
												Cancel Initialization
											</Button>
										</div>
									) : instance.status.toLowerCase() === "ready" ||
										instance.status.toLowerCase() === "busy" ? (
										<div className="flex flex-col gap-3 w-full">
											<Button
												variant="secondary"
												onClick={handleDisconnect}
												className="w-full"
											>
												<StopCircle className="mr-2 h-4 w-4" />
												Disconnect Instance
											</Button>
											<Button
												variant="destructive"
												onClick={handleForceDisconnect}
												className="w-full"
											>
												<Shield className="mr-2 h-4 w-4" />
												Force Disconnect
											</Button>
										</div>
									) : (
										<div className="flex flex-col gap-3 w-full">
											<Button
												size="lg"
												onClick={handleReconnect}
												className="w-full"
											>
												<PlayCircle className="mr-2 h-5 w-5" />
												Reconnect Instance
											</Button>
											<p className="text-xs text-center text-slate-500 mt-1">
												Reconnection may take a few moments to complete
											</p>
											<Button
												variant="outline"
												onClick={handleResetAndReconnect}
												className="w-full"
											>
												<RotateCw className="mr-2 h-4 w-4" />
												Reset & Reconnect
											</Button>
										</div>
									)}
								</div>

								{health && !health.healthy && health.message && (
									<div className="mt-4">
										<p className="text-sm font-medium text-red-500">
											Health issue detected:
										</p>
										<p className="mt-1 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
											{health.message}
										</p>
									</div>
								)}

								{instance.details.error_message && (
									<div className="mt-4">
										<p className="text-sm font-medium text-red-500">Error:</p>
										<p className="mt-1 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
											{instance.details.error_message}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{(instance.details.cpu_usage !== undefined ||
						instance.details.memory_usage !== undefined) && (
						<Card>
							<CardHeader>
								<CardTitle>Instance Metrics</CardTitle>
								<CardDescription>
									Performance metrics and statistics for this instance
								</CardDescription>
							</CardHeader>
							<CardContent>
								<dl className="space-y-2">
									{instance.details.cpu_usage !== undefined && (
										<div className="flex justify-between">
											<dt className="font-medium">CPU Usage:</dt>
											<dd>{(instance.details.cpu_usage * 100).toFixed(2)}%</dd>
										</div>
									)}
									{instance.details.memory_usage !== undefined && (
										<div className="flex justify-between">
											<dt className="font-medium">Memory Usage:</dt>
											<dd>
												{(
													instance.details.memory_usage /
													(1024 * 1024)
												).toFixed(2)}{" "}
												MB
											</dd>
										</div>
									)}
									{health?.connection_stability !== undefined && (
										<div className="flex justify-between">
											<dt className="font-medium">Connection Stability:</dt>
											<dd>{(health.connection_stability * 100).toFixed(0)}%</dd>
										</div>
									)}
								</dl>
							</CardContent>
						</Card>
					)}
				</>
			) : (
				<Card>
					<CardContent className="p-4">
						<p className="text-center text-slate-500">
							Instance not found or error loading instance details.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
