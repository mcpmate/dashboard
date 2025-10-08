import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { inspectorApi } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { SchemaForm } from "./schema-form";
import { defaultFromSchema } from "./schema-form-utils";
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
import type { JsonObject, JsonSchema, JsonValue } from "../types/json";
import type { CapabilityArgument, CapabilityRecord } from "../types/capabilities";

type InspectorKind = "tool" | "resource" | "prompt" | "template";

export interface InspectorDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	serverId?: string;
	serverName?: string;
	kind: InspectorKind;
	item: CapabilityRecord | null;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toCapabilityRecord = (value: unknown): CapabilityRecord | null =>
	(isRecord(value) ? (value as CapabilityRecord) : null);

const toString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

const isJsonObjectValue = (value: unknown): value is JsonObject =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toJsonObject = (value: JsonValue | undefined): JsonObject =>
	(isJsonObjectValue(value) ? value : {});

const toSchema = (value: unknown): JsonSchema | null => {
	const record = toCapabilityRecord(value);
	if (!record) return null;
	const nested = toCapabilityRecord(record.schema);
	if (nested) return nested as JsonSchema;
	return record as JsonSchema;
};

const normalizeArguments = (value: unknown): CapabilityArgument[] => {
	if (!Array.isArray(value)) return [];
	return value.map((entry, index) => {
		const record = toCapabilityRecord(entry);
		if (!record) {
			return { name: `arg_${index}` };
		}
		return {
			name: toString(record.name) ?? `arg_${index}`,
			type: toString(record.type) ?? "string",
			description: toString(record.description),
			required:
				typeof record.required === "boolean" ? record.required : undefined,
		};
	});
};

const buildSchemaFromArguments = (args: CapabilityArgument[]): JsonSchema => {
	const properties: Record<string, JsonSchema> = {};
	const required: string[] = [];
	args.forEach((arg, index) => {
		const name = arg.name ?? `arg_${index}`;
		properties[name] = {
			type: arg.type ?? "string",
			description: arg.description,
		};
		if (arg.required) {
			required.push(name);
		}
	});
	return {
		type: "object",
		properties,
		required: required.length ? required : undefined,
	};
};

const buildSchemaFromFields = (fields: Field[]): JsonSchema => {
	const properties: Record<string, JsonSchema> = {};
	const required: string[] = [];
	fields.forEach((field) => {
		properties[field.name] = {
			type: field.type || "string",
			description: field.description,
			enum: field.enum,
		};
		if (field.required) {
			required.push(field.name);
		}
	});
	return {
		type: "object",
		properties,
		required: required.length ? required : undefined,
	};
};

type InspectorResponse<T = unknown> = {
	success?: boolean;
	data?: T | null;
	error?: unknown;
};

function pickToolNameForMode(
	source: CapabilityRecord | null,
	mode: "proxy" | "native",
): string {
	if (!source) return "";
	const uniqueName = toString(source.unique_name);
	const toolName = toString(source.tool_name);
	const rawName = toString(source.name);
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
	const [values, setValues] = useState<JsonObject>({});
	const [schemaObj, setSchemaObj] = useState<JsonSchema | null>(null);
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
	const [result, setResult] = useState<unknown>(null);

	// Build mock from JSON Schema types
	function mockOfType(t?: string): JsonValue {
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

	function extractToolSchema(raw: CapabilityRecord | null): JsonSchema | null {
		// Support multiple shapes: input_schema.schema, inputSchema.schema, input_schema, inputSchema, schema
		if (!raw) return null;
		const candidates = [
			raw.input_schema,
			raw.inputSchema,
			raw.schema,
		];
		for (const candidate of candidates) {
			const schema = toSchema(candidate);
			if (schema) {
				if (!schema.type && schema.properties) {
					schema.type = "object";
				}
				return schema;
			}
		}
		// Ensure object type when properties exist
		return null;
	}

	function deriveFields(sourceItem: CapabilityRecord | null): Field[] {
		// Tools: item.input_schema?.properties; Prompts: item.arguments (array)
		try {
			if (kind === "tool") {
				const schema = extractToolSchema(sourceItem);
				const props = schema?.properties ?? {};
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
				if (list.length === 0) {
					list = normalizeArguments(sourceItem?.arguments).map((arg) => ({
						name: arg.name ?? "arg",
						type: arg.type ?? "string",
						required: Boolean(arg.required),
						description: arg.description,
					}));
				}
				return list;
			}
			if (kind === "prompt") {
				return normalizeArguments(sourceItem?.arguments).map((arg) => ({
					name: arg.name ?? "arg",
					type: arg.type ?? "string",
					required: Boolean(arg.required),
					description: arg.description,
				}));
			}
			return [];
		} catch {
			return [];
		}
	}

	function fillMock(fs: Field[]): JsonObject {
		const acc: JsonObject = {};
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
		const source = item ?? null;
		let schema: JsonSchema | null = null;
		if (kind === "tool") {
			schema = extractToolSchema(source);
			if (!schema) {
				const args = normalizeArguments(source?.arguments);
				if (args.length > 0) {
					schema = buildSchemaFromArguments(args);
				}
			}
		} else if (kind === "prompt") {
			const args = normalizeArguments(source?.arguments);
			if (args.length > 0) {
				schema = buildSchemaFromArguments(args);
			}
		}

		if (
			schema &&
			schema.type === "object" &&
			schema.properties &&
			Object.keys(schema.properties).length > 0
		) {
			setSchemaObj(schema);
			const mock = toJsonObject(defaultFromSchema(schema));
			setValues(mock);
			setArgsJson(JSON.stringify(mock, null, 2));
			setFields([]);
		} else {
			const fs = deriveFields(source);
			setFields(fs);
			if (fs.length > 0) {
				const generatedSchema = buildSchemaFromFields(fs);
				setSchemaObj(generatedSchema);
				const mock = toJsonObject(defaultFromSchema(generatedSchema));
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
					? toString(source?.unique_name) ??
						toString(source?.prompt_name) ??
						toString(source?.name)
					: toString(source?.prompt_name) ??
						toString(source?.name) ??
						toString(source?.unique_name)) ?? "";
			setName(promptName);
		} else if (kind === "resource") {
			const resourceUri =
				toString(source?.resource_uri) ??
				toString(source?.uri) ??
				toString(source?.name) ??
				"";
			setUri(resourceUri);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, item, kind, mode]);

	function parseArgs(): JsonObject | undefined {
		try {
			const obj = JSON.parse(argsJson || "{}");
			if (obj && typeof obj === "object" && !Array.isArray(obj)) {
				return obj as JsonObject;
			}
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
			let resp: InspectorResponse<Record<string, unknown>> | null = null;
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
				resp = (await inspectorApi.toolCall({
					tool: name,
					server_id: serverId,
					server_name: serverName,
					mode,
					arguments: args,
					timeout_ms: timeoutMs,
				})) as InspectorResponse<Record<string, unknown>>;
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Tool call failed",
					);
				}
				const data = (resp.data ?? {}) as Record<string, unknown>;
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
				resp = (await inspectorApi.promptGet({
					name,
					server_id: serverId,
					server_name: serverName,
					mode,
					arguments: args,
				})) as InspectorResponse<Record<string, unknown>>;
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Prompt get failed",
					);
				}
				const data = (resp.data ?? {}) as Record<string, unknown>;
				setResult((data.result as unknown) ?? data);
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
				resp = (await inspectorApi.resourceRead({
					uri,
					server_id: serverId,
					server_name: serverName,
					mode,
				})) as InspectorResponse<Record<string, unknown>>;
				if (!resp?.success) {
					throw new Error(
						resp?.error ? String(resp.error) : "Resource read failed",
					);
				}
				const data = (resp.data ?? {}) as Record<string, unknown>;
				setResult((data.result as unknown) ?? data);
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

	function pretty(value: unknown) {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
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
								const mock = toJsonObject(defaultFromSchema(schemaObj));
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
										const next = toJsonObject(v);
										setValues(next);
										setArgsJson(JSON.stringify(next, null, 2));
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
