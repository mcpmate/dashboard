import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inspectorApi } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { writeClipboardText } from "../lib/clipboard";
import type { InspectorSessionOpenData, InspectorSseEvent } from "../lib/types";
import type {
	CapabilityArgument,
	CapabilityRecord,
} from "../types/capabilities";
import type { JsonObject, JsonSchema, JsonValue } from "../types/json";
import { SchemaForm } from "./schema-form";
import { defaultFromSchema } from "./schema-form-utils";
import { Badge } from "./ui/badge";
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
import { ScrollArea } from "./ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import {
	Tooltip,
	TooltipArrow,
	TooltipContent,
	TooltipPortal,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

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
	event: "request" | "success" | "error" | "progress" | "log" | "cancelled";
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
	isRecord(value) ? (value as CapabilityRecord) : null;

const toString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

const isJsonObjectValue = (value: unknown): value is JsonObject =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toJsonObject = (value: JsonValue | undefined): JsonObject =>
	isJsonObjectValue(value) ? value : {};

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

type InspectorEventEntry = {
	data: InspectorSseEvent;
	timestamp: number;
};

const TOOL_KIND_KEYS: Array<keyof CapabilityRecord> = [
	"unique_name",
	"tool_name",
	"name",
];

const PROMPT_KIND_KEYS: Array<keyof CapabilityRecord> = [
	"unique_name",
	"prompt_name",
	"name",
];

const RESOURCE_KIND_KEYS: Array<keyof CapabilityRecord> = [
	"resource_uri",
	"uri",
	"name",
];

function computeRecordKey(
	record: CapabilityRecord | null,
	kind: InspectorKind,
): string {
	if (!record) return "";
	const sources =
		kind === "tool"
			? TOOL_KIND_KEYS
			: kind === "prompt"
				? PROMPT_KIND_KEYS
				: RESOURCE_KIND_KEYS;
	for (const key of sources) {
		const value = toString(record[key]);
		if (value) return value;
	}
	return "";
}

function formatEventLabel(entry: InspectorEventEntry): string {
	switch (entry.data.event) {
		case "started":
			return "Started";
		case "progress":
			return entry.data.total
				? `Progress ${entry.data.progress}/${entry.data.total}`
				: `Progress ${entry.data.progress}`;
		case "log":
			return entry.data.logger || entry.data.level || "Log";
		case "result":
			return "Result";
		case "error":
			return "Error";
		case "cancelled":
			return "Cancelled";
		default:
			return entry.data.event;
	}
}

function formatEventDetails(entry: InspectorEventEntry): string | null {
	const { data } = entry;
	switch (data.event) {
		case "started":
			return `Session: ${data.session_id ?? "n/a"}`;
		case "progress":
			return data.message ?? null;
		case "log":
			return safeJson(data.data);
		case "result":
			return `Elapsed ${data.elapsed_ms} ms`;
		case "error":
			return data.message;
		case "cancelled":
			return data.reason ?? null;
		default:
			return null;
	}
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function formatTimestamp(ts: number): string {
	return new Date(ts).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function badgeVariantForEvent(
	event: InspectorSseEvent["event"],
): "default" | "secondary" | "destructive" | "outline" {
	switch (event) {
		case "started":
			return "secondary";
		case "progress":
			return "default";
		case "log":
			return "outline";
		case "result":
			return "default";
		case "error":
		case "cancelled":
			return "destructive";
		default:
			return "outline";
	}
}

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
	const [overrideItem, setOverrideItem] = useState<CapabilityRecord | null>(
		null,
	);
	const currentItem = overrideItem ?? item;
	const [uri, setUri] = useState<string>(
		String(currentItem?.resource_uri || currentItem?.uri || ""),
	);
	const [name, setName] = useState<string>(
		String(
			currentItem?.unique_name ||
				currentItem?.tool_name ||
				currentItem?.prompt_name ||
				currentItem?.name ||
				"",
		),
	);
	const [submitting, setSubmitting] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [result, setResult] = useState<unknown>(null);
	const [events, setEvents] = useState<InspectorEventEntry[]>([]);
	const eventsEndRef = useRef<HTMLDivElement | null>(null);
	const [session, setSession] = useState<InspectorSessionOpenData | null>(null);
	const eventSourceRef = useRef<EventSource | null>(null);
	const [activeCallId, setActiveCallId] = useState<string | null>(null);
	const activeCallIdRef = useRef<string | null>(null);
	const lastSessionParams = useRef<{
		mode: "proxy" | "native";
		serverId?: string;
		serverName?: string;
	} | null>(null);
	const [toolOptions, setToolOptions] = useState<CapabilityRecord[]>([]);
	const [toolOptionsLoading, setToolOptionsLoading] = useState(false);
	const [toolOptionsError, setToolOptionsError] = useState<string | null>(null);
	const [view, setView] = useState<"response" | "events">("response");
	const [formCollapsed, setFormCollapsed] = useState(false);
	const propItemKey = useMemo(() => computeRecordKey(item, kind), [item, kind]);
	const currentItemKey = useMemo(
		() => computeRecordKey(currentItem, kind),
		[currentItem, kind],
	);
	const lastPropKeyRef = useRef<string>(propItemKey);
	const wasOpenRef = useRef<boolean>(false);

	useEffect(() => {
		if (propItemKey !== lastPropKeyRef.current) {
			setOverrideItem(null);
			lastPropKeyRef.current = propItemKey;
		}
	}, [propItemKey]);

	useEffect(() => {
		if (open && !wasOpenRef.current) {
			setResult(null);
			setEvents([]);
			setView("response");
			setOverrideItem(null);
			setFormCollapsed(false);
		}
		if (!open && wasOpenRef.current) {
			setOverrideItem(null);
			setEvents([]);
			setActiveCallId(null);
			activeCallIdRef.current = null;
			setSubmitting(false);
			setCancelling(false);
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		}
		wasOpenRef.current = open;
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		setResult(null);
		setEvents([]);
		setView("response");
		setSubmitting(false);
		setCancelling(false);
		setActiveCallId(null);
		activeCallIdRef.current = null;
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		setFormCollapsed(false);
	}, [open, currentItemKey, mode, kind]);

	useEffect(() => {
		eventsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [events]);

	useEffect(() => {
		if (!open || kind !== "tool") {
			setToolOptions([]);
			setToolOptionsError(null);
			setToolOptionsLoading(false);
			return;
		}
		if (!serverId && !serverName) {
			setToolOptions([]);
			setToolOptionsLoading(false);
			setToolOptionsError(null);
			return;
		}
		let cancelled = false;
		setToolOptionsLoading(true);
		setToolOptionsError(null);
		(async () => {
			try {
				const resp = (await inspectorApi.toolsList({
					server_id: serverId,
					server_name: serverName,
					mode,
				})) as InspectorResponse<{ tools?: unknown[] }> | undefined;
				if (cancelled) return;
				const rawList = Array.isArray(resp?.data?.tools)
					? resp?.data?.tools
					: [];
				const normalized = rawList
					.map((entry) => toCapabilityRecord(entry))
					.filter(Boolean) as CapabilityRecord[];
				setToolOptions(normalized);
			} catch (error) {
				if (!cancelled) {
					setToolOptionsError(
						error instanceof Error ? error.message : String(error ?? ""),
					);
				}
			} finally {
				if (!cancelled) {
					setToolOptionsLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, kind, serverId, serverName, mode, propItemKey]);

	useEffect(() => {
		activeCallIdRef.current = activeCallId;
	}, [activeCallId]);

	useEffect(() => {
		let cancelled = false;

		const ensureSession = async () => {
			if (!open || kind !== "tool") {
				if (session) {
					try {
						await inspectorApi.sessionClose({ session_id: session.session_id });
					} catch (error) {
						console.warn("Failed to close inspector session", error);
					}
					if (!cancelled) {
						setSession(null);
					}
				}
				lastSessionParams.current = null;
				return;
			}

			const params = { mode, serverId, serverName };

			if (
				session &&
				lastSessionParams.current &&
				lastSessionParams.current.mode === mode &&
				lastSessionParams.current.serverId === serverId &&
				lastSessionParams.current.serverName === serverName
			) {
				return;
			}

			if (session) {
				try {
					await inspectorApi.sessionClose({ session_id: session.session_id });
				} catch (error) {
					console.warn("Failed to close inspector session", error);
				}
				if (cancelled) return;
				setSession(null);
			}

			try {
				const response = await inspectorApi.sessionOpen({
					mode,
					server_id: serverId,
					server_name: serverName,
				});
				if (!cancelled && response?.success && response.data) {
					setSession(response.data);
					lastSessionParams.current = params;
				}
			} catch (error) {
				if (!cancelled) {
					notifyError("Failed to open inspector session", String(error));
					lastSessionParams.current = null;
				}
			}
		};

		void ensureSession();

		return () => {
			cancelled = true;
		};
	}, [open, kind, mode, serverId, serverName, session]);

	useEffect(() => {
		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			if (session) {
				void inspectorApi
					.sessionClose({ session_id: session.session_id })
					.catch((error) =>
						console.warn("Failed to close inspector session", error),
					);
			}
		};
	}, [session]);

	useEffect(() => {
		if (!open && eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
	}, [open]);

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
		const candidates = [raw.input_schema, raw.inputSchema, raw.schema];
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
		const source = currentItem ?? null;
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
					? (toString(source?.unique_name) ??
						toString(source?.prompt_name) ??
						toString(source?.name))
					: (toString(source?.prompt_name) ??
						toString(source?.name) ??
						toString(source?.unique_name))) ?? "";
			setName(promptName);
		} else if (kind === "resource") {
			const resourceUri =
				toString(source?.resource_uri) ??
				toString(source?.uri) ??
				toString(source?.name) ??
				"";
			setUri(resourceUri);
		}
		// Maintaining manual dependency list—internal helpers are stable within this component lifecycle.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, currentItem, kind, mode]);

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

	const toolMap = useMemo(() => {
		const map = new Map<string, CapabilityRecord>();
		toolOptions.forEach((entry, index) => {
			const key = computeRecordKey(entry, "tool") || `index:${index}`;
			map.set(key, entry);
		});
		return map;
	}, [toolOptions]);
	const sortedTools = useMemo(() => {
		return Array.from(toolMap.entries()).sort((a, b) => {
			const labelA = pickToolNameForMode(a[1], mode) || a[0];
			const labelB = pickToolNameForMode(b[1], mode) || b[0];
			return labelA.localeCompare(labelB);
		});
	}, [toolMap, mode]);
	const toolSelectValue = useMemo(() => {
		if (kind !== "tool") {
			return undefined;
		}
		return currentItemKey && toolMap.has(currentItemKey)
			? currentItemKey
			: undefined;
	}, [kind, currentItemKey, toolMap]);

	const handleToolSelect = useCallback(
		(value: string) => {
			setResult(null);
			setEvents([]);
			setView("response");
			setActiveCallId(null);
			activeCallIdRef.current = null;
			setUseRaw(false);
			const match = toolMap.get(value);
			if (match) {
				setOverrideItem(match);
				setName(pickToolNameForMode(match, mode));
			} else {
				setOverrideItem(null);
				setName(value);
			}
		},
		[toolMap, mode],
	);

	const handleCancel = useCallback(async () => {
		if (!activeCallId) {
			return;
		}
		try {
			setCancelling(true);
			setView("events");
			await inspectorApi.toolCallCancel({
				call_id: activeCallId,
				reason: "cancelled_by_user",
			});
		} catch (error) {
			notifyError(
				"Cancel failed",
				error instanceof Error ? error.message : String(error ?? ""),
			);
		} finally {
			setCancelling(false);
		}
	}, [activeCallId]);

	const clearOutput = useCallback(() => {
		setResult(null);
		setEvents([]);
		setView("response");
	}, []);

	const hasSchemaInputs =
		schemaObj &&
		schemaObj.properties &&
		Object.keys(schemaObj.properties).length > 0;
	const hasFieldInputs = fields.length > 0;
	const expectsArguments =
		kind !== "resource" && (hasSchemaInputs || hasFieldInputs);
	const sessionExpiry = useMemo(() => {
		if (!session?.expires_at_epoch_ms) return null;
		const ms = Number(session.expires_at_epoch_ms);
		if (!Number.isFinite(ms)) return null;
		return new Date(ms).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	}, [session]);

	const handleInspectorEvent = useCallback(
		(payload: InspectorSseEvent) => {
			if (
				activeCallIdRef.current &&
				payload.call_id !== activeCallIdRef.current
			) {
				return;
			}

			setEvents((prev) => {
				const next = [...prev, { data: payload, timestamp: Date.now() }];
				return next.length > 200 ? next.slice(next.length - 200) : next;
			});

			switch (payload.event) {
				case "started":
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "request",
						method: "tools/call",
						mode,
						payload,
					});
					break;
				case "progress":
					setView("events");
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "progress",
						method: "tools/call",
						mode,
						message: payload.message ?? undefined,
						payload,
					});
					break;
				case "log":
					setView("events");
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "log",
						method: "tools/call",
						mode,
						message: payload.logger ?? payload.level ?? undefined,
						payload: payload.data,
					});
					break;
				case "result":
					setSubmitting(false);
					setResult(payload.result);
					setCancelling(false);
					setView("response");
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "success",
						method: "tools/call",
						mode,
						payload,
					});
					notifySuccess("Inspector executed", "See response below");
					if (eventSourceRef.current) {
						eventSourceRef.current.close();
						eventSourceRef.current = null;
					}
					setActiveCallId(null);
					activeCallIdRef.current = null;
					break;
				case "error":
					setSubmitting(false);
					setCancelling(false);
					setView("events");
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "error",
						method: "tools/call",
						mode,
						message: payload.message,
						payload,
					});
					notifyError("Inspector request failed", payload.message);
					if (eventSourceRef.current) {
						eventSourceRef.current.close();
						eventSourceRef.current = null;
					}
					setActiveCallId(null);
					activeCallIdRef.current = null;
					break;
				case "cancelled":
					setSubmitting(false);
					setCancelling(false);
					setView("events");
					onLog?.({
						id: newLogId(),
						timestamp: Date.now(),
						channel: "inspector",
						event: "cancelled",
						method: "tools/call",
						mode,
						message: payload.reason ?? undefined,
						payload,
					});
					notifyError(
						"Inspector call cancelled",
						payload.reason ?? "Call cancelled",
					);
					if (eventSourceRef.current) {
						eventSourceRef.current.close();
						eventSourceRef.current = null;
					}
					setActiveCallId(null);
					activeCallIdRef.current = null;
					break;
			}
		},
		[mode, onLog],
	);

	const subscribeToCall = useCallback(
		(callId: string) => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}

			try {
				const url = inspectorApi.toolCallEventsUrl(callId);
				const source = new EventSource(url);
				eventSourceRef.current = source;

				source.onmessage = (event) => {
					try {
						const data: InspectorSseEvent = JSON.parse(event.data);
						handleInspectorEvent(data);
					} catch (error) {
						console.warn("Failed to parse inspector event", error);
					}
				};

				source.onerror = () => {
					source.close();
					eventSourceRef.current = null;
					setSubmitting(false);
				};
			} catch (error) {
				console.warn("Failed to subscribe to inspector events", error);
				setSubmitting(false);
			}
		},
		[handleInspectorEvent],
	);

	async function onSubmit() {
		try {
			setSubmitting(true);
			setResult(null);
			if (kind === "tool") {
				setEvents([]);
				setCancelling(false);
			}
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

				const effectiveServerId = session?.server_id ?? serverId;
				if (!effectiveServerId && !serverName) {
					throw new Error("Inspector session missing server context");
				}

				onLog?.({
					...baseLog,
					event: "request",
					method: "tools/call",
					payload: {
						tool: name,
						server_id: effectiveServerId,
						server_name: serverName,
						arguments: args,
						timeout_ms: timeoutMs,
						session_id: session?.session_id,
					},
				});

				const response = await inspectorApi.toolCallStart({
					tool: name,
					server_id: effectiveServerId,
					server_name: serverName,
					mode,
					arguments: args,
					timeout_ms: timeoutMs,
					session_id: session?.session_id,
				});

				const data = response?.data ?? null;
				if (!response?.success || !data) {
					throw new Error(
						response?.error ? String(response.error) : "Tool call failed",
					);
				}

				setActiveCallId(data.call_id);
				activeCallIdRef.current = data.call_id;
				subscribeToCall(data.call_id);
				return;
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
			if (kind !== "tool") {
				setSubmitting(false);
			}
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
			setSubmitting(false);
		} finally {
			if (kind !== "tool") {
				setSubmitting(false);
			}
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
			await writeClipboardText(text);
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

	const sessionActive = Boolean(session);
	const sessionIndicator =
		kind === "tool" ? (
			<TooltipProvider delayDuration={150}>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="inline-flex h-8 w-8 items-center justify-center text-slate-500 transition hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
							aria-label={
								sessionActive
									? "Inspector session active"
									: "Inspector session pending"
							}
						>
							{sessionActive ? (
								<CheckCircle2 className="h-5 w-5 text-emerald-500" />
							) : (
								<AlertCircle className="h-5 w-5 text-amber-500" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="left"
						align="end"
						className="max-w-xs text-xs leading-relaxed"
					>
						{sessionActive ? (
							<p>
								Connected to {serverName || session?.server_id}. Follow-up tools
								reuse this session required for chaining actions. Expires{" "}
								{sessionExpiry ?? "soon"}.
							</p>
						) : (
							<p>
								No inspector session yet. We create one automatically on the
								next run and keep it alive until you close the drawer.
							</p>
						)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		) : null;

	const handleCollapseFormClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (formCollapsed) return;
			const target = event.target as HTMLElement;
			// 排除按钮和链接点击
			if (
				target.closest("button") ||
				target.closest("a") ||
				target.closest('[data-prevent-collapse="true"]')
			) {
				return;
			}
			setFormCollapsed(true);
		},
		[formCollapsed],
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex h-full flex-col overflow-hidden">
				<DrawerHeader className="shrink-0">
					<div className="flex items-start justify-between gap-3">
						<div>
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
						</div>
						{sessionIndicator}
					</div>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
					<div
						className={`transition-all duration-300 ease-in-out overflow-hidden ${
							formCollapsed ? "max-h-10" : "max-h-[800px]"
						}`}
					>
						{formCollapsed ? (
							<div
								role="button"
								onClick={() => setFormCollapsed(false)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										setFormCollapsed(false);
									}
								}}
								tabIndex={0}
								className="flex cursor-pointer items-center justify-between rounded border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900/40"
							>
								<span>Parameters</span>
								<Info className="h-3.5 w-3.5" />
							</div>
						) : (
							<div className="space-y-4">
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
													<Input
														value={serverName || serverId || "-"}
														disabled
													/>
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
										<Input
											value={uri}
											onChange={(e) => setUri(e.target.value)}
										/>
									</div>
								) : (
									<div className="space-y-2">
										<div className="space-y-1">
											<Label>{kind === "tool" ? "Tool" : "Prompt"}</Label>
											{kind === "tool" ? (
												<Select
													value={toolSelectValue}
													onValueChange={handleToolSelect}
													disabled={
														toolOptionsLoading && toolOptions.length === 0
													}
												>
													<SelectTrigger className="justify-between">
														<SelectValue
															placeholder={
																toolOptionsLoading
																	? "Loading tools..."
																	: "选择需要执行的工具"
															}
														/>
													</SelectTrigger>
													<SelectContent>
														{toolOptionsLoading ? (
															<SelectItem value="__loading" disabled>
																Loading…
															</SelectItem>
														) : null}
														{sortedTools.map(([value, entry]) => {
															const display =
																pickToolNameForMode(entry, mode) || value;
															const description = toString(entry.description);
															return (
																<SelectItem key={value} value={value}>
																	<div className="flex items-center gap-2">
																		<TooltipProvider delayDuration={100}>
																			<Tooltip>
																				<TooltipTrigger asChild>
																					<span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
																						<Info className="h-3.5 w-3.5" />
																					</span>
																				</TooltipTrigger>
																				<TooltipContent
																					side="right"
																					align="center"
																					className="max-w-xs text-xs leading-relaxed"
																				>
																					{description?.trim().length
																						? description
																						: "该工具暂无描述"}
																				</TooltipContent>
																			</Tooltip>
																		</TooltipProvider>
																		<span className="text-sm font-medium text-slate-700 dark:text-slate-100">
																			{display}
																		</span>
																	</div>
																</SelectItem>
															);
														})}
													</SelectContent>
												</Select>
											) : (
												<Input
													value={name}
													onChange={(e) => setName(e.target.value)}
												/>
											)}
										</div>
										{toolOptionsError ? (
											<p className="text-xs text-red-500">{toolOptionsError}</p>
										) : null}
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
																const mock = toJsonObject(
																	defaultFromSchema(schemaObj),
																);
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
										<div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
											No arguments required for this capability.
										</div>
									)
								) : null}
							</div>
						)}
					</div>

					<Tabs
						value={view}
						onValueChange={(val) => setView(val as "response" | "events")}
						className="space-y-3"
					>
						<TabsList className="grid w-full grid-cols-2 text-sm">
							<TabsTrigger value="response">Response</TabsTrigger>
							<TabsTrigger value="events">Events</TabsTrigger>
						</TabsList>
						<TabsContent
							value="response"
							className="space-y-2"
							onClick={handleCollapseFormClick}
						>
							<div className="flex items-center justify-between gap-2 text-sm">
								<Label>Response</Label>
								{result ? (
									<ButtonGroup>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={(event) => {
												event.stopPropagation();
												handleCopy();
											}}
											data-prevent-collapse="true"
										>
											Copy
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={(event) => {
												event.stopPropagation();
												clearOutput();
											}}
											data-prevent-collapse="true"
										>
											Clear
										</Button>
									</ButtonGroup>
								) : null}
							</div>
							<div className="max-h-[40vh] overflow-auto rounded border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 whitespace-pre-wrap break-words dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
								{result
									? pretty(result)
									: "Run a capability to view its structured response here."}
							</div>
						</TabsContent>
						<TabsContent
							value="events"
							className="space-y-2"
							onClick={handleCollapseFormClick}
						>
							<div className="flex items-center justify-between">
								<Label>Event Stream</Label>
								{events.length ? (
									<Badge variant="outline" className="text-[11px] font-medium">
										{events.length}
									</Badge>
								) : null}
							</div>
							{events.length === 0 ? (
								<div className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
									Streaming progress, logs, and cancellations will appear here
									once you run a tool call.
								</div>
							) : (
								<ScrollArea className="max-h-[32vh] pr-2">
									<ul className="space-y-2">
										{events.map((entry, index) => {
											const label = formatEventLabel(entry);
											const detail = formatEventDetails(entry);
											const key = `${entry.data.event}-${entry.timestamp}-${index}`;
											return (
												<li
													key={key}
													className="rounded border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900/50"
												>
													<div className="flex items-center justify-between gap-2">
														<div className="flex items-center gap-2">
															<Badge
																variant={badgeVariantForEvent(entry.data.event)}
																className="uppercase"
															>
																{entry.data.event}
															</Badge>
															<span className="font-medium text-slate-700 dark:text-slate-100">
																{label}
															</span>
														</div>
														<span className="text-[11px] text-slate-500 dark:text-slate-300">
															{formatTimestamp(entry.timestamp)}
														</span>
													</div>
													{detail ? (
														<pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">
															{detail}
														</pre>
													) : null}
												</li>
											);
										})}
									</ul>
									<div ref={eventsEndRef} />
								</ScrollArea>
							)}
						</TabsContent>
					</Tabs>
				</div>

				<DrawerFooter className="shrink-0 border-t px-6 py-4">
					<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<Button
							variant="outline"
							onClick={() => onOpenChange(false)}
							className="w-full sm:w-auto"
						>
							Close
						</Button>
						<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
							{kind === "tool" && activeCallId && submitting ? (
								<Button
									variant="destructive"
									onClick={handleCancel}
									disabled={cancelling}
									className="w-full sm:w-auto"
								>
									{cancelling ? "Cancelling..." : "Cancel"}
								</Button>
							) : null}
							<Button
								onClick={onSubmit}
								disabled={submitting}
								className="w-full sm:w-auto"
							>
								{submitting ? "Running..." : "Run"}
							</Button>
						</div>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export default InspectorDrawer;
