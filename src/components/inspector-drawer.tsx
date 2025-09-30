import { useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "./ui/textarea";
import { notifyError, notifySuccess } from "../lib/notify";
import { inspectorApi } from "../lib/api";
import { SchemaForm, defaultFromSchema } from "./schema-form";

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
	const [callId, setCallId] = useState<string | null>(null);
	const sseRef = useRef<EventSource | null>(null);
	const [progressInfo, setProgressInfo] = useState<{ percent?: number; message?: string } | null>(null);
	const [streamError, setStreamError] = useState<string | null>(null);

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
		// Rebuild schema / initial values on open or item change
		const source = item ?? {};
		let schema: any | null = null;
		if (kind === "tool") {
			schema = extractToolSchema(source);
			if (!schema) {
				// As a last resort, build schema from arguments if present
				const args = Array.isArray(source?.arguments) ? source.arguments : [];
				if (args.length) {
					const props: Record<string, any> = {};
					const req: string[] = [];
					args.forEach((a: any) => {
						const t = String(a?.type || "string");
						props[String(a?.name || "arg")] = {
							type: t,
							description: a?.description,
						};
						if (a?.required) req.push(String(a?.name));
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
				props[String(a?.name || "arg")] = {
					type: t,
					description: a?.description,
				};
				if (a?.required) req.push(String(a?.name));
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
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, item, kind]);

	useEffect(() => {
		if (!callId) {
			return;
		}
		const es = new EventSource(
			`/api/mcp/inspector/tool/call/stream?call_id=${encodeURIComponent(callId)}`,
		);
		sseRef.current = es;

		const handleEvent = (type: string) => (event: MessageEvent) => {
			try {
				const payload = JSON.parse(event.data || "{}");
				const data = payload.data ?? {};
				switch (type) {
					case "progress": {
						const percent =
							typeof data.percent === "number"
								? data.percent
								: typeof data.progress === "number"
									? data.progress
									: undefined;
						setProgressInfo({
							percent,
							message: data.message,
						});
						onLog?.({
							id: newLogId(),
							timestamp: Date.now(),
							channel: "inspector",
							event: "success",
							method: "tools/call",
							mode,
							message: data.message || "progress",
							payload: data,
						});
						break;
					}
					case "log": {
						onLog?.({
							id: newLogId(),
							timestamp: Date.now(),
							channel: "inspector",
							event: "success",
							method: "tools/call",
							mode,
							message: data.message || data.level || "log",
							payload: data,
						});
						break;
					}
					case "result": {
						setProgressInfo(null);
						setCallId(null);
						if (sseRef.current) {
							sseRef.current.close();
							sseRef.current = null;
						}
						setSubmitting(false);
						setResult(data.result ?? data);
						notifySuccess("Inspector executed", "See response below");
						onLog?.({
							id: newLogId(),
							timestamp: Date.now(),
							channel: "inspector",
							event: "success",
							method: "tools/call",
							mode,
							payload: data,
						});
						break;
					}
					case "error": {
						setProgressInfo(null);
						setCallId(null);
						if (sseRef.current) {
							sseRef.current.close();
							sseRef.current = null;
						}
						setSubmitting(false);
						setStreamError(data.message || "Tool call failed");
						onLog?.({
							id: newLogId(),
							timestamp: Date.now(),
							channel: "inspector",
							event: "error",
							method: "tools/call",
							mode,
							payload: data,
						});
						notifyError("Inspector request failed", data.message || "Tool error");
						break;
					}
					case "cancelled": {
						setProgressInfo(null);
						setCallId(null);
						if (sseRef.current) {
							sseRef.current.close();
							sseRef.current = null;
						}
						setSubmitting(false);
						setStreamError(data.reason || "Call cancelled");
						onLog?.({
							id: newLogId(),
							timestamp: Date.now(),
							channel: "inspector",
							event: "error",
							method: "tools/call",
							mode,
							message: data.reason || "cancelled",
							payload: data,
						});
						break;
					}
				}
			} catch (err) {
				console.error("Failed to process inspector SSE", err);
			}
		};

		["progress", "result", "error", "cancelled", "log"].forEach((eventName) => {
			es.addEventListener(eventName, handleEvent(eventName));
		});

		es.onerror = () => {
			setStreamError("Inspector stream disconnected");
			setSubmitting(false);
			setProgressInfo(null);
			setCallId(null);
			es.close();
			sseRef.current = null;
		};

		return () => {
			es.close();
			sseRef.current = null;
		};
	}, [callId, mode, onLog, serverId, serverName]);

	useEffect(() => {
		if (!open) {
			if (callId) {
				inspectorApi
					.toolCallCancel({ call_id: callId })
					.catch(() => undefined);
			}
			if (sseRef.current) {
				sseRef.current.close();
				sseRef.current = null;
			}
			setCallId(null);
			setProgressInfo(null);
		}
	}, [open, callId]);

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

	async function onSubmit() {
		try {
			setSubmitting(true);
			setResult(null);
			setStreamError(null);
			setProgressInfo(null);
			if (sseRef.current) {
				sseRef.current.close();
				sseRef.current = null;
			}
			if (callId) {
				setCallId(null);
			}
			let resp: any = null;
			const baseLog = {
				id: newLogId(),
				timestamp: Date.now(),
				channel: "inspector" as const,
				mode,
			};
			if (kind === "tool") {
				const args = useRaw ? parseArgs() : values;
				if (args === undefined) return;
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
				if (data.result) {
					setResult(data);
					onLog?.({
						...baseLog,
						event: "success",
						method: "tools/call",
						payload: data,
					});
					notifySuccess("Inspector executed", "See response below");
				} else if (data.call_id) {
					setCallId(String(data.call_id));
					onLog?.({
						...baseLog,
						event: "success",
						method: "tools/call",
						payload: data,
						message: data.message || "accepted",
					});
				} else {
					setResult(data);
					onLog?.({
						...baseLog,
						event: "success",
						method: "tools/call",
						payload: data,
					});
					notifySuccess("Inspector executed", "See response below");
				}
			} else if (kind === "prompt") {
				const args = useRaw ? parseArgs() : values;
				if (args === undefined) return;
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

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
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

				<div className="px-4 py-3 space-y-4">
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
							<Input value={serverName || serverId || "-"} disabled />
							{serverName && serverId ? (
								<p className="text-[11px] text-slate-500">ID: {serverId}</p>
							) : null}
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
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>Arguments</Label>
								<div className="flex items-center gap-2 text-xs">
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
								</div>
							</div>
							{useRaw ? (
								<Textarea
									rows={8}
									className="font-mono text-xs"
									value={argsJson}
									onChange={(e) => setArgsJson(e.target.value)}
								/>
							) : schemaObj ? (
								<SchemaForm
									schema={schemaObj}
									value={values}
									onChange={(v) => {
										setValues(v);
										setArgsJson(JSON.stringify(v, null, 2));
									}}
								/>
							) : (
								<Textarea
									rows={6}
									className="font-mono text-xs"
									value={argsJson}
									onChange={(e) => setArgsJson(e.target.value)}
								/>
							)}
						</div>
					) : null}

					{progressInfo ? (
						<div className="rounded border border-sky-200 bg-sky-50 dark:bg-slate-900/40 p-2 text-xs text-sky-700 dark:text-sky-300">
							Progress:
							{typeof progressInfo.percent === "number"
								? ` ${progressInfo.percent.toFixed(1)}%`
								: " updating"}
							{progressInfo.message ? ` · ${progressInfo.message}` : ""}
						</div>
					) : null}

					{streamError ? (
						<div className="rounded border border-red-200 bg-red-50 dark:bg-red-900/30 p-2 text-xs text-red-700 dark:text-red-300">
							{streamError}
						</div>
					) : null}

					{result ? (
						<div className="space-y-2">
							<Label>Response</Label>
							<pre className="bg-slate-50 dark:bg-slate-900 rounded p-3 text-xs overflow-auto max-h-[40vh]">
								{pretty(result)}
							</pre>
						</div>
					) : null}
				</div>

				<DrawerFooter>
					<div className="flex gap-2 w-full">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => onOpenChange(false)}
						>
							Close
						</Button>
						<Button className="flex-1" onClick={onSubmit} disabled={submitting}>
							{submitting ? "Running..." : "Run"}
						</Button>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export default InspectorDrawer;
