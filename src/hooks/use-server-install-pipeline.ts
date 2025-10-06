import { useCallback, useMemo, useState } from "react";
import { serializeMetaForApi, serversApi } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import type { ServerMetaInfo } from "../lib/types";

export type InstallSource = "manual" | "ingest" | "market";

export interface ServerInstallDraft {
	name: string;
	kind: "stdio" | "sse" | "streamable_http";
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	registryServerId?: string;
	headers?: Record<string, string>;
	urlParams?: Record<string, string>;
	meta?: ServerMetaInfo;
}

interface UseServerInstallPipelineOptions {
	onImported?: () => void;
}

interface PreviewState {
	success: boolean;
	data?: any;
	error?: unknown;
}

export function useServerInstallPipeline(
	opts: UseServerInstallPipelineOptions = {},
) {
	const [isDrawerOpen, setDrawerOpen] = useState(false);
	const [drafts, setDrafts] = useState<ServerInstallDraft[]>([]);
	const [source, setSource] = useState<InstallSource | null>(null);
	const [isPreviewLoading, setPreviewLoading] = useState(false);
	const [previewState, setPreviewState] = useState<PreviewState | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isImporting, setImporting] = useState(false);

	const reset = useCallback(() => {
		setDrawerOpen(false);
		setDrafts([]);
		setSource(null);
		setPreviewState(null);
		setPreviewError(null);
		setPreviewLoading(false);
		setImporting(false);
	}, []);

	const buildPreviewPayload = useCallback((items: ServerInstallDraft[]) => {
		return {
			include_details: true,
			servers: items.map((item) => ({
				name: item.name,
				kind: item.kind,
				command: item.kind === "stdio" ? (item.command ?? null) : null,
				args: item.args?.length ? item.args : null,
				env: item.env && Object.keys(item.env).length ? item.env : null,
				url:
					item.kind !== "stdio"
						? (() => {
								if (!item.url) return null;
								if (!item.urlParams || !Object.keys(item.urlParams).length)
									return item.url;
								try {
									const u = new URL(
										item.url,
										/^https?:/i.test(item.url)
											? undefined
											: "http://dummy.local",
									);
									for (const [k, v] of Object.entries(item.urlParams)) {
										u.searchParams.set(k, v);
									}
									return /^https?:/i.test(item.url)
										? u.toString()
										: `${item.url}?${u.searchParams.toString()}`;
								} catch {
									// Fallback: naive concatenation
									const qs = new URLSearchParams(item.urlParams).toString();
									return `${item.url}?${qs}`;
								}
							})()
						: null,
				headers:
					item.kind !== "stdio" &&
					item.headers &&
					Object.keys(item.headers).length
						? item.headers
						: null,
			})),
		};
	}, []);

	const buildImportPayload = useCallback((items: ServerInstallDraft[]) => {
		const payload: Record<string, any> = {};
		for (const item of items) {
			const metaPayload = serializeMetaForApi(item.meta);
			const entry: Record<string, unknown> = {
				type: item.kind,
			};
			if (item.kind === "stdio" && item.command) {
				entry.command = item.command;
			}
			if (item.kind !== "stdio" && item.url) {
				// Compose full URL with urlParams (same behavior as preview)
				if (item.urlParams && Object.keys(item.urlParams).length) {
					try {
						const u = new URL(
							item.url,
							/^https?:/i.test(item.url) ? undefined : "http://dummy.local",
						);
						for (const [k, v] of Object.entries(item.urlParams)) {
							u.searchParams.set(k, v);
						}
						entry.url = /^https?:/i.test(item.url)
							? u.toString()
							: `${item.url}?${u.searchParams.toString()}`;
					} catch {
						const qs = new URLSearchParams(
							item.urlParams as Record<string, string>,
						).toString();
						entry.url = `${item.url}?${qs}`;
					}
				} else {
					entry.url = item.url;
				}
			}
			if (item.args?.length) {
				entry.args = item.args;
			}
			if (item.env && Object.keys(item.env).length) {
				entry.env = item.env;
			}
			if (item.registryServerId) {
				entry.registry_server_id = item.registryServerId;
			}
			// Do not send a separate url_params field: backend import path doesn't consume it today.
			if (metaPayload) {
				entry.meta = metaPayload;
			}
			payload[item.name] = entry;
		}
		return { mcpServers: payload };
	}, []);

	const begin = useCallback(
		async (items: ServerInstallDraft[], origin: InstallSource) => {
			if (!items.length) {
				notifyError(
					"No servers detected",
					"Provide at least one server to preview",
				);
				return;
			}

			setDrafts(items);
			setSource(origin);
			setPreviewState(null);
			setPreviewError(null);
			setDrawerOpen(true);
			setPreviewLoading(true);

			try {
				const payload = buildPreviewPayload(items);
				const result = await serversApi.previewServers({
					...payload,
					timeout_ms: 30000, // 30 seconds for stdio servers that need to install dependencies
					// TODO: Implement intelligent timeout handling for server preview
					// - Add user-friendly timeout management UI
					// - Show dependency download progress indication
					// - Allow users to temporarily increase timeout time
					// - Implement smart timeout detection based on server type and dependency requirements
				});
				setPreviewState(result);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Preview request failed";
				setPreviewError(message);
				notifyError("Preview failed", message);
			} finally {
				setPreviewLoading(false);
			}
		},
		[buildPreviewPayload],
	);

	const confirmImport = useCallback(async () => {
		if (!drafts.length) return;
		try {
			setImporting(true);
			const payload = buildImportPayload(drafts);
			const result = await serversApi.importServers(payload);
			const didSucceed =
				typeof result?.success === "boolean"
					? result.success
					: (result as { status?: string })?.status === "success" ||
						!("error" in (result ?? {}));
			if (didSucceed) {
				notifySuccess("Servers installed", "Import completed successfully");
				opts.onImported?.();
				reset();
				return;
			}
			notifyError("Import failed", String(result.error ?? "Unknown error"));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error ?? "");
			notifyError("Import failed", message || "Unexpected error");
		} finally {
			setImporting(false);
		}
	}, [drafts, buildImportPayload, opts, reset]);

	const state = useMemo(
		() => ({
			drafts,
			source,
			previewState,
			previewError,
			isPreviewLoading,
			isImporting,
			open: isDrawerOpen,
		}),
		[
			drafts,
			source,
			previewState,
			previewError,
			isPreviewLoading,
			isImporting,
			isDrawerOpen,
		],
	);

	return {
		state,
		begin,
		confirmImport,
		close: reset,
		setPreviewState,
	};
}
