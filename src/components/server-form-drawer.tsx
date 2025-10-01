import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { MCPServerConfig } from "../lib/types";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "./ui/drawer";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { notifyError, notifySuccess } from "../lib/notify";
import { serversApi } from "../lib/api";
import { Badge } from "./ui/badge";

// Form validation schema
const serverFormSchema = z.object({
	name: z
		.string()
		.min(1, "Server name cannot be empty")
		.max(50, "Server name cannot exceed 50 characters"),
	kind: z.enum(["stdio", "sse", "streamable_http"], {
		required_error: "Please select a server type",
	}),
	command: z.string().optional(),
	command_path: z.string().optional(),
	args: z.string().optional(),
	env: z.string().optional(),
	max_instances: z.coerce.number().int().positive().optional(),
});

type ServerFormValues = z.infer<typeof serverFormSchema>;

interface ServerFormDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (data: Partial<MCPServerConfig>) => Promise<void>;
	initialData?: Partial<MCPServerConfig>;
	title?: string;
	submitLabel?: string;
	isEditing?: boolean; // editing existing server (hides import tab)
	enableImportTab?: boolean;
	onImported?: () => void;
}

export function ServerFormDrawer({
	isOpen,
	onClose,
	onSubmit,
	initialData,
	title = "Add Server",
	submitLabel = "Save",
	isEditing = false,
	enableImportTab = true,
	onImported,
}: ServerFormDrawerProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState<"form" | "import">("form");
	const [importText, setImportText] = useState<string>(sample());
	const [preview, setPreview] = useState<any | null>(null);

	// Force cleanup when drawer closes
	useEffect(() => {
		if (!isOpen) {
			const overlays = document.querySelectorAll(
				"[data-radix-popper-content-wrapper]",
			);
			overlays.forEach((overlay) => overlay.remove());

			setError(null);
			setIsSubmitting(false);
			setPreview(null);
			setTab("form");
		}
	}, [isOpen]);

	// Convert initial data to form values
	const defaultValues: Partial<ServerFormValues> = {
		name: initialData?.name || "",
		kind: initialData?.kind || "stdio",
		command: initialData?.command || "",
		command_path: initialData?.command_path || "",
		args: initialData?.args ? initialData.args.join(" ") : "",
		env: initialData?.env
			? Object.entries(initialData.env)
					.map(([key, value]) => `${key}=${value}`)
					.join("\n")
			: "",
		max_instances: initialData?.max_instances || 1,
	};

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
		setValue,
		watch,
	} = useForm<ServerFormValues>({
		resolver: zodResolver(serverFormSchema),
		defaultValues,
	});

	// Monitor server type changes
	const serverType = watch("kind");

	// Handle form submission
	const handleFormSubmit = async (data: ServerFormValues) => {
		setIsSubmitting(true);
		setError(null);

		try {
			// Convert form data to server configuration
			const serverConfig: Partial<MCPServerConfig> = {
				// Only include name for new servers, not for updates
				...(isEditing ? {} : { name: data.name }),
				kind: data.kind,
				command: data.command || undefined,
				command_path: data.command_path || undefined,
				args: data.args ? data.args.split(" ").filter(Boolean) : undefined,
				env: data.env
					? data.env.split("\n").reduce(
							(acc, line) => {
								const [key, ...valueParts] = line.split("=");
								if (key && valueParts.length > 0) {
									acc[key.trim()] = valueParts.join("=").trim();
								}
								return acc;
							},
							{} as Record<string, string>,
						)
					: undefined,
				max_instances: data.max_instances || undefined,
			};

			await onSubmit(serverConfig);
			reset();
			onClose();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Error saving server configuration",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Import helpers
	function parsePreviewPayload(): {
		ok: boolean;
		payload?: any;
		error?: string;
	} {
		try {
			const obj = JSON.parse(importText);
			if (obj.mcpServers && typeof obj.mcpServers === "object") {
				const servers = Object.keys(obj.mcpServers).map((name) => {
					const c = obj.mcpServers[name] || {};
					return {
						name,
						kind: c.type || c.kind || "stdio",
						command: c.command ?? null,
						args: Array.isArray(c.args) ? c.args : null,
						env: c.env ?? null,
						url: c.url ?? null,
					};
				});
				return { ok: true, payload: { servers, include_details: false } };
			}
			if (Array.isArray(obj.servers)) {
				const servers = obj.servers.map((s: any) => ({
					...s,
					args: Array.isArray(s.args) ? s.args : null,
					kind: s.kind || s.type || "stdio",
				}));
				return { ok: true, payload: { servers, include_details: false } };
			}
			return {
				ok: false,
				error: "JSON must include `mcpServers` mapping or `servers` array",
			};
		} catch (e) {
			return { ok: false, error: String(e) };
		}
	}

	function parseImportPayload(): {
		ok: boolean;
		payload?: any;
		error?: string;
	} {
		try {
			const obj = JSON.parse(importText);
			if (obj.mcpServers && typeof obj.mcpServers === "object") {
				// Ensure required 'type' is present per schema; default to 'stdio'
				const normalized: Record<string, any> = {};
				for (const key of Object.keys(obj.mcpServers)) {
					const conf = obj.mcpServers[key] || {};
					normalized[key] = {
						type: conf.type || conf.kind || "stdio",
						command: conf.command ?? null,
						args: Array.isArray(conf.args) ? conf.args : null,
						env: conf.env ?? null,
						url: conf.url ?? null,
					};
				}
				return { ok: true, payload: { mcpServers: normalized } };
			}
			if (Array.isArray(obj.servers)) {
				const mapping: Record<string, any> = {};
				for (const s of obj.servers) {
					if (!s?.name)
						return { ok: false, error: "servers[] items must include name" };
					mapping[s.name] = {
						type: s.kind || s.type || "stdio",
						command: s.command ?? null,
						args: Array.isArray(s.args) ? s.args : null,
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

	function buildPreviewVariants(base: any): any[] {
		// Base first
		const variants: any[] = [{ ...base }];
		try {
			const servers = Array.isArray(base?.servers) ? base.servers : [];
			const anyStdioWithNpx = servers.some(
				(s: any) =>
					(s?.kind || s?.type) === "stdio" &&
					String(s?.command || "")
						.trim()
						.toLowerCase() === "npx",
			);
			if (anyStdioWithNpx) {
				const vUv = {
					...base,
					servers: servers.map((s: any) => {
						if ((s?.kind || s?.type) !== "stdio") return s;
						if (
							String(s?.command || "")
								.trim()
								.toLowerCase() !== "npx"
						)
							return s;
						const args = Array.isArray(s.args)
							? s.args.filter((a: string) => a !== "-y")
							: undefined;
						return { ...s, command: "uvx", args };
					}),
				};
				variants.push(vUv);
				const vBun = {
					...base,
					servers: servers.map((s: any) => {
						if ((s?.kind || s?.type) !== "stdio") return s;
						if (
							String(s?.command || "")
								.trim()
								.toLowerCase() !== "npx"
						)
							return s;
						const args = Array.isArray(s.args)
							? s.args.filter((a: string) => a !== "-y")
							: undefined;
						return { ...s, command: "bunx", args };
					}),
				};
				variants.push(vBun);
			}
		} catch {
			/* noop */
		}
		return variants;
	}

	async function doPreview() {
		const p = parsePreviewPayload();
		if (!p.ok) return notifyError("Invalid JSON", p.error);
		try {
			setIsSubmitting(true);
			const base = { ...p.payload, timeout_ms: 5000 };
			const variants = buildPreviewVariants(base);
			let best: any | null = null;
			for (const v of variants) {
				const res = await serversApi.previewServers(v);
				best = res;
				const items = res?.data?.items || [];
				// If any item is ok=true or all have no error, accept immediately
				if (items.length && items.some((it: any) => it?.ok)) break;
			}
			setPreview(best);
			notifySuccess("Preview generated", "Results are shown below");
		} catch (e) {
			notifyError("Preview failed", String(e));
		} finally {
			setIsSubmitting(false);
		}
	}

	async function doImport() {
		const p = parseImportPayload();
		if (!p.ok) return notifyError("Invalid JSON", p.error);
		try {
			setIsSubmitting(true);
			const res = await serversApi.importServers(p.payload);
			notifySuccess(
				res.success ? "Imported" : "Import finished",
				res.success ? "Servers imported successfully" : "See summary below",
			);
			onImported?.();
			onClose();
		} catch (e) {
			notifyError("Import failed", String(e));
		} finally {
			setIsSubmitting(false);
		}
	}

	function formatJson() {
		try {
			const obj = JSON.parse(importText);
			setImportText(JSON.stringify(obj, null, 2));
		} catch {
			// ignore
		}
	}

	return (
		<Drawer open={isOpen} onOpenChange={onClose}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>
						Configure server connection information. You can use a form or paste
						a JSON snippet to import servers.
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4">
					<Tabs
						defaultValue="form"
						value={tab}
						onValueChange={(v) => setTab(v as any)}
					>
						{enableImportTab && !isEditing ? (
							<div className="mb-2 flex items-center justify-between">
								<TabsList>
									<TabsTrigger value="form">Form</TabsTrigger>
									<TabsTrigger value="import">
										<span className="flex items-center gap-2">
											Import JSON
											<Badge
												variant="warning"
												className="h-5 px-2 py-0 text-[10px]"
											>
												WIP
											</Badge>
										</span>
									</TabsTrigger>
								</TabsList>
							</div>
						) : null}

						<TabsContent value="form">
							<form
								onSubmit={handleSubmit(handleFormSubmit)}
								className="space-y-4 py-4"
							>
								{error && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="name">Server Name</Label>
										<Input
											id="name"
											{...register("name")}
											placeholder="e.g., my-server"
											disabled={isEditing}
										/>
										{errors.name && (
											<p className="text-xs text-red-500">
												{errors.name.message}
											</p>
										)}
										{isEditing && (
											<p className="text-xs text-gray-500">
												Server name cannot be changed after creation
											</p>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="kind">Server Type</Label>
										<Select
											defaultValue={defaultValues.kind}
											onValueChange={(value) => setValue("kind", value as any)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select server type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="stdio">
													Standard Input/Output (stdio)
												</SelectItem>
												<SelectItem value="sse">
													Server-Sent Events (SSE)
												</SelectItem>
												<SelectItem value="streamable_http">
													HTTP Stream (Streamable HTTP)
												</SelectItem>
											</SelectContent>
										</Select>
										{errors.kind && (
											<p className="text-xs text-red-500">
												{errors.kind.message}
											</p>
										)}
									</div>
								</div>

								{serverType === "stdio" && (
									<>
										<div className="space-y-2">
											<Label htmlFor="command">Command</Label>
											<Input
												id="command"
												{...register("command")}
												placeholder="e.g., python -m my_script"
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor="command_path">Command Path</Label>
											<Input
												id="command_path"
												{...register("command_path")}
												placeholder="e.g., /usr/local/bin"
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor="args">Arguments (space separated)</Label>
											<Input
												id="args"
												{...register("args")}
												placeholder="e.g., --debug --port 8080"
											/>
										</div>
									</>
								)}

								{(serverType === "sse" || serverType === "streamable_http") && (
									<div className="space-y-2">
										<Label htmlFor="command">URL</Label>
										<Input
											id="command"
											{...register("command")}
											placeholder="e.g., http://localhost:8080"
										/>
									</div>
								)}

								<div className="space-y-2">
									<Label htmlFor="env">
										Environment Variables (one per line, KEY=VALUE format)
									</Label>
									<Textarea
										id="env"
										{...register("env")}
										placeholder="e.g.,&#10;PORT=8080&#10;DEBUG=true"
										rows={4}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="max_instances">Maximum Instances</Label>
									<Input
										id="max_instances"
										type="number"
										min="1"
										{...register("max_instances")}
									/>
								</div>
							</form>
						</TabsContent>

						{enableImportTab && !isEditing ? (
							<TabsContent value="import">
								<div className="space-y-4 py-4">
									<Textarea
										rows={12}
										value={importText}
										onChange={(e) => setImportText(e.target.value)}
										className="font-mono text-xs"
									/>
									<div className="flex gap-2">
										<Button
											variant="outline"
											type="button"
											onClick={formatJson}
										>
											Format
										</Button>
										<Button
											type="button"
											onClick={doPreview}
											disabled={isSubmitting}
										>
											Preview
										</Button>
										<Button
											type="button"
											variant="secondary"
											onClick={doImport}
											disabled={isSubmitting}
										>
											Import
										</Button>
									</div>
									{preview && (
										<div className="rounded border p-3">
											{/* Global explanation if any item reports error */}
											{preview.data?.items?.some((it: any) => it.error) ? (
												<div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
													Some servers couldn’t be contacted during preview
													(e.g. command not installed or terminated early). You
													can still import the configuration; capabilities will
													populate once the server runs.
												</div>
											) : null}
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
																tools: {it.tools?.items?.length ?? 0} •
																resources: {it.resources?.items?.length ?? 0} •
																templates:{" "}
																{it.resource_templates?.items?.length ?? 0} •
																prompts: {it.prompts?.items?.length ?? 0}
															</div>
														</div>
													))}
												</div>
											) : (
												<div className="text-sm text-slate-500">
													No preview data.
												</div>
											)}
										</div>
									)}
								</div>
							</TabsContent>
						) : null}
					</Tabs>
				</div>

				<DrawerFooter>
					<div className="flex w-full items-center justify-between">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						{tab === "form" ? (
							<Button
								type="submit"
								onClick={handleSubmit(handleFormSubmit)}
								disabled={isSubmitting}
							>
								{isSubmitting && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{submitLabel}
							</Button>
						) : (
							<Button
								type="button"
								onClick={doImport}
								disabled={isSubmitting}
							>
								{isSubmitting && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								Import
							</Button>
						)}
					</div>
				</DrawerFooter>
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

export default ServerFormDrawer;
