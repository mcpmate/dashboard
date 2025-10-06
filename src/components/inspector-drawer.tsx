import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { inspectorApi } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { defaultFromSchema, SchemaForm } from "./schema-form";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Card, CardContent } from "./ui/card";
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
import { Textarea } from "./ui/textarea";
import {
	Tooltip,
	TooltipArrow,
	TooltipContent,
	TooltipPortal,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

type InspectorKind = "tool" | "resource" | "prompt";

export interface InspectorDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	serverId?: string;
	serverName?: string;
	kind: InspectorKind;
	item: any; // raw capability item (tool/resource/prompt)
	mode: "proxy" | "native";
	onLog?: (entry: InspectorLogEntry) => void;
}

type Field = {
	name: string;
	type: string;
	required?: boolean;
	description?: string;
	enum?: string[];
};

export interface InspectorLogEntry {
	id: string;
	timestamp: number;
	channel: "inspector";
	event: "request" | "success" | "error";
	method: string;
	mode: "proxy" | "native";
	payload?: unknown;
	message?: string;
}

function newLogId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID)
		return crypto.randomUUID();
	return `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function pickToolNameForMode(source: any, mode: "proxy" | "native"): string {
	if (!source) return "";
	const uniqueName =
		typeof source.unique_name === "string" ? source.unique_name : undefined;
	const toolName =
		typeof source.tool_name === "string" ? source.tool_name : undefined;
	const rawName = typeof source.name === "string" ? source.name : undefined;
	if (mode === "proxy") {
		return uniqueName || toolName || rawName || "";
	}
	return toolName || rawName || uniqueName || "";
}

export function InspectorDrawer({
	open,
	onOpenChange,
	serverId,
	serverName,
	kind,
	item,
	mode,
	onLog,
}: InspectorDrawerProps) {
	const [timeoutMs, setTimeoutMs] = useState<number>(8000);
	const [argsJson, setArgsJson] = useState<string>("{}");
	const [useRaw, setUseRaw] = useState(false);
	const [fields, setFields] = useState<Field[]>([]);
	const [values, setValues] = useState<Record<string, any>>({});
	const [schemaObj, setSchemaObj] = useState<any | null>(null);
	const [uri, setUri] = useState<string>(
		String(item?.resource_uri || item?.uri || ""),
	);
	const [name, setName] = useState<string>(
		String(
			item?.unique_name ||
				item?.tool_name ||
				item?.prompt_name ||
				item?.name ||
				"",
		),
	);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<any | null>(null);

	// Build mock from JSON Schema types
	function mockOfType(t?: string): any {
		switch ((t || "string").toLowerCase()) {
			case "integer":
				return 1;
			case "number":
				return 1.0;
			case "boolean":
				return true;
			case "array":
				return ["example"];
			case "object":
				return { key: "value" };
			default:
				return "example";
		}
	}

	function extractToolSchema(raw: any): any | null {
		// Support multiple shapes: input_schema.schema, inputSchema.schema, input_schema, inputSchema, schema
		const s =
			raw?.input_schema?.schema ||
			raw?.inputSchema?.schema ||
			raw?.input_schema ||
			raw?.inputSchema ||
			raw?.schema ||
			null;
		if (!s) return null;
		// Ensure object type when properties exist
		if (!s.type && s.properties) s.type = "object";
		return s;
	}

	function deriveFields(sourceItem: any): Field[] {
		// Tools: item.input_schema?.properties; Prompts: item.arguments (array)
		try {
			if (kind === "tool") {
				const schema = extractToolSchema(sourceItem);
				const props = schema?.properties || {};
				let list: Field[] = [];
				if (props && Object.keys(props).length > 0) {
					const required: string[] = Array.isArray(schema?.required)
						? schema.required
						: [];
					list = Object.keys(props).map((k) => {
						const p = props[k] || {};
						const type = Array.isArray(p.type)
							? String(p.type[0])
							: String(p.type || "string");
						const en = Array.isArray(p.enum) ? (p.enum as string[]) : undefined;
						return {
							name: k,
							type,
							required: required.includes(k),
							description: p.description,
							enum: en,
						};
					});
				}
				// Fallback to arguments array if schema had no properties
				if (list.length === 0 && Array.isArray(sourceItem?.arguments)) {
					list = sourceItem.arguments.map((a: any) => ({
						name: String(a?.name || "arg"),
						type: String(a?.type || "string"),
						required: !!a?.required,
						description: a?.description,
					}));
				}
				return list;
			}
			if (kind === "prompt") {
				const args = Array.isArray(sourceItem?.arguments)
					? sourceItem.arguments
					: [];
				return args.map((a: any) => ({
					name: String(a?.name || "arg"),
					type: String(a?.type || "string"),
					required: !!a?.required,
					description: a?.description,
				}));
			}
			return [];
		} catch {
			return [];
		}
	}

	function fillMock(fs: Field[]): Record<string, any> {
		const acc: Record<string, any> = {};
		fs.forEach((f) => {
			if (f.enum && f.enum.length) acc[f.name] = f.enum[0];
			else acc[f.name] = mockOfType(f.type);
		});
		return acc;
	}

	useEffect(() => {
		if (!open) {
			return;
		}
		const source = item ?? {};
		let schema: any | null = null;
		if (kind === "tool") {
			schema = extractToolSchema(source);
			if (!schema) {
				const args = Array.isArray(source?.arguments) ? source.arguments : [];
				if (args.length) {
					const props: Record<string, any> = {};
					const req: string[] = [];
					args.forEach((a: any) => {
						const t = String(a?.type || "string");
						const nameKey = String(a?.name || "arg");
						props[nameKey] = { type: t, description: a?.description };
						if (a?.required) req.push(nameKey);
					});
					schema = { type: "object", properties: props, required: req };
				}
			}
		} else if (kind === "prompt") {
			const props: Record<string, any> = {};
			const req: string[] = [];
			const args = Array.isArray(source?.arguments) ? source.arguments : [];
			args.forEach((a: any) => {
				const t = String(a?.type || "string");
				const nameKey = String(a?.name || "arg");
				props[nameKey] = { type: t, description: a?.description };
				if (a?.required) req.push(nameKey);
			});
			schema = { type: "object", properties: props, required: req };
		}

		if (
			schema &&
			schema.type === "object" &&
			schema.properties &&
			Object.keys(schema.properties).length > 0
		) {
			setSchemaObj(schema);
			const mock = defaultFromSchema(schema);
			setValues(mock);
			setArgsJson(JSON.stringify(mock, null, 2));
			setFields([]);
		} else {
			const fs = deriveFields(source);
			setFields(fs);
			if (fs.length > 0) {
				const genProps: Record<string, any> = {};
				const reqNames: string[] = [];
				fs.forEach((f) => {
					const prop: any = { type: f.type || "string" };
					if (f.enum) prop.enum = f.enum;
					if (f.description) prop.description = f.description;
					genProps[f.name] = prop;
					if (f.required) reqNames.push(f.name);
				});
				const genSchema = {
					type: "object",
					properties: genProps,
					required: reqNames,
				} as any;
				setSchemaObj(genSchema);
				const mock = defaultFromSchema(genSchema);
				setValues(mock);
				setArgsJson(JSON.stringify(mock, null, 2));
			} else {
				setSchemaObj(null);
				const mock = fillMock(fs);
				setValues(mock);
				setArgsJson(JSON.stringify(mock, null, 2));
				setUseRaw(false);
			}
		}

		if (kind === "tool") {
			setName(pickToolNameForMode(source, mode));
		} else if (kind === "prompt") {
			const promptName =
				(mode === "proxy"
					? source?.unique_name || source?.prompt_name || source?.name
					: source?.prompt_name || source?.name || source?.unique_name) || "";
			setName(String(promptName));
		} else if (kind === "resource") {
			const resourceUri =
				source?.resource_uri || source?.uri || source?.name || "";
			setUri(String(resourceUri));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, item, kind, mode]);

	function parseArgs(): Record<string, any> | undefined {
		try {
			const obj = JSON.parse(argsJson || "{}");
			if (obj && typeof obj === "object") return obj;
			return undefined;
		} catch {
			notifyError("Invalid arguments", "Arguments must be valid JSON");
			return undefined;
		}
	}

	const hasSchemaInputs =
		schemaObj &&
		schemaObj.properties &&
		Object.keys(schemaObj.properties).length > 0;
	const hasFieldInputs = fields.length > 0;
	const expectsArguments =
		kind !== "resource" && (hasSchemaInputs || hasFieldInputs);

	async function onSubmit() {
		try {
			setSubmitting(true);
			setResult(null);
			let resp: any = null;
			const baseLog = {
				id: newLogId(),
				timestamp: Date.now(),
				channel: "inspector" as const,
				mode,
			};
			if (kind === "tool") {
				const args = expectsArguments
					? useRaw
						? parseArgs()
						: values
					: undefined;
				if (expectsArguments && args === undefined) return;
				onLog?.({
					...baseLog,
					event: "request",
					method: "tools/call",
					payload: {
						tool: name,
						server_id: serverId,
						server_name: serverName,
						arguments: args,
						timeout_ms: timeoutMs,
					},
				});
				resp = await inspectorApi.toolCall({
					tool: name,
					server_id: serverId,
					server_name: serverName,
					mode,
					arguments: args,
					timeout_ms: timeoutMs,
				});
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Tool call failed",
					);
				}
				const data = resp.data ?? {};
				setResult(data);
				onLog?.({
					...baseLog,
					event: "success",
					method: "tools/call",
					payload: data,
				});
				notifySuccess("Inspector executed", "See response below");
			} else if (kind === "prompt") {
				const args = expectsArguments
					? useRaw
						? parseArgs()
						: values
					: undefined;
				if (expectsArguments && args === undefined) return;
				onLog?.({
					...baseLog,
					event: "request",
					method: "prompts/get",
					payload: {
						name,
						server_id: serverId,
						server_name: serverName,
						arguments: args,
					},
				});
				resp = await inspectorApi.promptGet({
					name,
					server_id: serverId,
					server_name: serverName,
					mode,
					arguments: args,
				});
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Prompt get failed",
					);
				}
				const data = resp.data ?? {};
				setResult(data.result ?? data);
				onLog?.({
					...baseLog,
					event: "success",
					method: "prompts/get",
					payload: data,
				});
				notifySuccess("Inspector executed", "See response below");
			} else {
				onLog?.({
					...baseLog,
					event: "request",
					method: "resources/read",
					payload: { uri, server_id: serverId, server_name: serverName },
				});
				resp = await inspectorApi.resourceRead({
					uri,
					server_id: serverId,
					server_name: serverName,
					mode,
				});
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Resource read failed",
					);
				}
				const data = resp.data ?? {};
				setResult(data.result ?? data);
				onLog?.({
					...baseLog,
					event: "success",
					method: "resources/read",
					payload: data,
				});
				notifySuccess("Inspector executed", "See response below");
			}
			setSubmitting(false);
		} catch (e) {
			onLog?.({
				id: newLogId(),
				timestamp: Date.now(),
				channel: "inspector",
				event: "error",
				method:
					kind === "tool"
						? "tools/call"
						: kind === "prompt"
							? "prompts/get"
							: "resources/read",
				mode,
				message: e instanceof Error ? e.message : String(e),
				payload: e,
			});
			notifyError("Inspector request failed", String(e));
		} finally {
			setSubmitting(false);
		}
	}

	function pretty(v: any) {
		try {
			return JSON.stringify(v, null, 2);
		} catch {
			return String(v);
		}
	}

	const handleCopy = useCallback(async () => {
		if (result == null) return;
		try {
			const text =
				typeof result === "string" ? result : JSON.stringify(result, null, 2);
			await navigator.clipboard.writeText(text);
			notifySuccess(
				"Response copied",
				"Inspector response copied to clipboard.",
			);
		} catch (err) {
			notifyError(
				"Copy failed",
				err instanceof Error ? err.message : String(err),
			);
		}
	}, [result]);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex h-full flex-col overflow-hidden">
				<DrawerHeader className="shrink-0">
					<DrawerTitle>
						Inspector ·{" "}
						{kind === "tool"
							? "Tool Call"
							: kind === "resource"
								? "Read Resource"
								: "Get Prompt"}
					</DrawerTitle>
					<DrawerDescription>
						Run quick calls against server capabilities without leaving the
						page.
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div className="space-y-1">
							<Label>Mode</Label>
							<Input value={mode} disabled className="font-mono" />
						</div>
						{kind === "tool" ? (
							<div className="space-y-1">
								<Label>Timeout (ms)</Label>
								<Input
									type="number"
									min={1000}
									step={500}
									value={timeoutMs}
									onChange={(e) =>
										setTimeoutMs(parseInt(e.target.value) || 8000)
									}
								/>
							</div>
						) : null}
						<div className="space-y-1">
							<Label>Server</Label>
							<TooltipProvider delayDuration={200}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Input value={serverName || serverId || "-"} disabled />
									</TooltipTrigger>
									{serverName && serverId ? (
										<TooltipPortal>
											<TooltipContent side="top" align="start">
												<p className="text-xs">ID: {serverId}</p>
												<TooltipArrow />
											</TooltipContent>
										</TooltipPortal>
									) : null}
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>

					{kind === "resource" ? (
						<div className="space-y-1">
							<Label>Resource URI</Label>
							<Input value={uri} onChange={(e) => setUri(e.target.value)} />
						</div>
					) : (
						<div className="space-y-1">
							<Label>{kind === "tool" ? "Tool" : "Prompt"} Name</Label>
							<Input value={name} onChange={(e) => setName(e.target.value)} />
						</div>
					)}

					{kind !== "resource" ? (
						expectsArguments ? (
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<Label>Parameters</Label>
									<ButtonGroup>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												if (schemaObj) {
													const mock = defaultFromSchema(schemaObj);
													setValues(mock);
													setArgsJson(JSON.stringify(mock, null, 2));
												} else {
													const mock = fillMock(fields);
													setValues(mock);
													setArgsJson(JSON.stringify(mock, null, 2));
												}
											}}
										>
											Fill Mock
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setValues({});
												setArgsJson("{}");
											}}
										>
											Clean
										</Button>
										<Button
											size="sm"
											variant={useRaw ? "default" : "outline"}
											onClick={() => setUseRaw((v) => !v)}
										>
											{useRaw ? "Form" : "JSON"}
										</Button>
									</ButtonGroup>
								</div>
								{useRaw ? (
									<Textarea
										rows={8}
										className="font-mono text-xs"
										value={argsJson}
										onChange={(e) => setArgsJson(e.target.value)}
									/>
								) : schemaObj ? (
									<Card>
										<CardContent className="p-4">
											<SchemaForm
												schema={schemaObj}
												value={values}
												onChange={(v) => {
													setValues(v);
													setArgsJson(JSON.stringify(v, null, 2));
												}}
											/>
										</CardContent>
									</Card>
								) : (
									<Textarea
										rows={6}
										className="font-mono text-xs"
										value={argsJson}
										onChange={(e) => setArgsJson(e.target.value)}
									/>
								)}
							</div>
						) : (
							<div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
								No arguments required for this capability.
							</div>
						)
					) : null}

					{result ? (
						<div className="space-y-2">
							<Label>Response</Label>
							<div className="group/response relative">
								<pre className="max-h-[40vh] overflow-auto rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap break-words dark:bg-slate-900">
									{pretty(result)}
								</pre>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={handleCopy}
									className="absolute top-2 right-2 h-8 w-8 px-0 opacity-0 transition-opacity group-hover/response:opacity-100 focus:opacity-100 bg-background/80 hover:bg-background"
								>
									<Copy className="h-4 w-4" />
									<span className="sr-only">Copy response</span>
								</Button>
							</div>
						</div>
					) : null}
				</div>

				<DrawerFooter className="shrink-0 border-t px-6 py-4">
					<div className="flex w-full items-center justify-between gap-3">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
						<Button onClick={onSubmit} disabled={submitting}>
							{submitting ? "Running..." : "Run"}
						</Button>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export default InspectorDrawer;
