import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { serversApi } from "../lib/api";
import { Button } from "./ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
} from "./ui/drawer";
import { Textarea } from "./ui/textarea";
import { notifyError, notifySuccess } from "../lib/notify";

type PreviewResult = {
	success: boolean;
	data?: { items: any[] } | null;
	error?: unknown | null;
};

export function ServerImportDrawer({
	open,
	onOpenChange,
	onImported,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImported?: () => void;
}) {
	const [text, setText] = useState<string>(sample());
	const [preview, setPreview] = useState<PreviewResult | null>(null);
	const [importing, setImporting] = useState(false);

	useEffect(() => {
		if (!open) {
			setPreview(null);
		}
	}, [open]);

	const previewM = useMutation({
		mutationFn: async (payload: any) => serversApi.previewServers(payload),
		onSuccess: (res) => setPreview(res as any),
		onError: (e) => notifyError("Preview failed", String(e)),
	});

	function parsePayload(): { ok: boolean; payload?: any; error?: string } {
		try {
			const obj = JSON.parse(text);
			if (obj.mcpServers && typeof obj.mcpServers === "object") {
				const servers = Object.keys(obj.mcpServers).map((name) => {
					const c = obj.mcpServers[name] || {};
					return {
						name,
						kind: c.type || c.kind || "stdio",
						command: c.command ?? null,
						args: c.args ?? null,
						env: c.env ?? null,
						url: c.url ?? null,
					};
				});
				return { ok: true, payload: { servers, include_details: true } };
			}
			if (Array.isArray(obj.servers)) {
				return {
					ok: true,
					payload: { servers: obj.servers, include_details: true },
				};
			}
			return {
				ok: false,
				error: "JSON must include `mcpServers` mapping or `servers` array",
			};
		} catch (e) {
			return { ok: false, error: String(e) };
		}
	}

	function parseImport(): { ok: boolean; payload?: any; error?: string } {
		try {
			const obj = JSON.parse(text);
			if (obj.mcpServers && typeof obj.mcpServers === "object") {
				return { ok: true, payload: { mcpServers: obj.mcpServers } };
			}
			if (Array.isArray(obj.servers)) {
				const mapping: Record<string, any> = {};
				for (const s of obj.servers) {
					if (!s?.name)
						return { ok: false, error: "servers[] items must include name" };
					mapping[s.name] = {
						type: s.kind || s.type || "stdio",
						command: s.command ?? null,
						args: s.args ?? null,
						env: s.env ?? null,
						url: s.url ?? null,
					};
				}
				return { ok: true, payload: { mcpServers: mapping } };
			}
			return {
				ok: false,
				error: "JSON must include `mcpServers` mapping or `servers` array",
			};
		} catch (e) {
			return { ok: false, error: String(e) };
		}
	}

	async function doPreview() {
		const p = parsePayload();
		if (!p.ok) return notifyError("Invalid JSON", p.error);
		previewM.mutate(p.payload);
	}

	async function doImport() {
		const p = parseImport();
		if (!p.ok) return notifyError("Invalid JSON", p.error);
		try {
			setImporting(true);
			const res = await serversApi.importServers(p.payload);
			notifySuccess(
				res.success ? "Imported" : "Import finished",
				res.success ? "Servers imported successfully" : "See summary above",
			);
			if (onImported) onImported();
			onOpenChange(false);
		} catch (e) {
			notifyError("Import failed", String(e));
		} finally {
			setImporting(false);
		}
	}

	function formatJson() {
		try {
			const obj = JSON.parse(text);
			setText(JSON.stringify(obj, null, 2));
		} catch {
			// ignore
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Import / Preview Servers</DrawerTitle>
					<DrawerDescription>
						Paste JSON with `mcpServers` mapping or a `servers` array.
					</DrawerDescription>
				</DrawerHeader>
				<div className="p-4 space-y-4">
					<Textarea
						rows={12}
						value={text}
						onChange={(e) => setText(e.target.value)}
						className="font-mono text-xs"
					/>
					<div className="flex gap-2">
						<Button variant="outline" onClick={formatJson}>
							Format
						</Button>
						<Button onClick={doPreview} disabled={previewM.isPending}>
							Preview
						</Button>
						<Button variant="secondary" onClick={doImport} disabled={importing}>
							Import
						</Button>
					</div>

					{preview && (
						<div className="rounded border p-3">
							{preview.success && preview.data?.items?.length ? (
								<div className="space-y-2 text-sm">
									{preview.data.items.map((it: any) => (
										<div key={it.name} className="rounded border p-2">
											<div className="font-medium">
												{it.name}{" "}
												{it.ok === false ? (
													<span className="text-red-500">(error)</span>
												) : null}
											</div>
											{it.error ? (
												<div className="text-xs text-red-500">
													{String(it.error)}
												</div>
											) : null}
											<div className="text-xs text-slate-500 mt-1">
												tools: {it.tools?.items?.length ?? 0} • resources:{" "}
												{it.resources?.items?.length ?? 0} • templates:{" "}
												{it.resource_templates?.items?.length ?? 0} • prompts:{" "}
												{it.prompts?.items?.length ?? 0}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-sm text-slate-500">No preview data.</div>
							)}
						</div>
					)}
				</div>
				<DrawerFooter />
			</DrawerContent>
		</Drawer>
	);
}

function sample() {
	return JSON.stringify(
		{
			mcpServers: {
				example_stdio: {
					type: "stdio",
					command: "node",
					args: ["server.js"],
					env: { NODE_ENV: "production" },
				},
				example_http: { type: "streamable_http", url: "http://localhost:9000" },
			},
		},
		null,
		2,
	);
}

export default ServerImportDrawer;
