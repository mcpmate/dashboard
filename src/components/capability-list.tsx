import { Check } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../lib/store";
import type {
	CapabilityArgument,
	CapabilityMapItem,
	CapabilityRecord,
} from "../types/capabilities";
import type { JsonSchema } from "../types/json";
import { CachedAvatar } from "./cached-avatar";
import {
	CapsuleStripeList,
	CapsuleStripeListItem,
} from "./capsule-stripe-list";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

type CapabilityKind = "tools" | "resources" | "prompts" | "templates";
type ContextType = "server" | "profile";

export interface CapabilityListProps<T = CapabilityRecord> {
	title?: string;
	kind: CapabilityKind;
	context?: ContextType;
	items: T[];
	loading?: boolean;
	filterText?: string;
	onFilterTextChange?: (text: string) => void;
	emptyText?: string;
	enableToggle?: boolean;
	getId?: (item: T) => string;
	getEnabled?: (item: T) => boolean;
	onToggle?: (id: string, next: boolean, item: T) => void;
	selectable?: boolean;
	selectedIds?: string[];
	onSelectToggle?: (id: string, item: T) => void;
	asCard?: boolean;
	renderAction?: (mapped: CapabilityMapItem<T>, item: T) => ReactNode;
}

function asString(v: unknown): string | undefined {
	if (v == null) return undefined;
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function normalizeMultiline(text?: string): string | undefined {
	if (!text) return text;
	try {
		return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
	} catch {
		return text;
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toCapabilityRecord = (value: unknown): CapabilityRecord | null =>
	isRecord(value) ? (value as CapabilityRecord) : null;

const toIconArray = (value: unknown): unknown[] => {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	return [value];
};

const extractIconSrc = (item: CapabilityRecord | null): string | undefined => {
	if (!item) return undefined;
	const meta = toCapabilityRecord(item.meta);
	const candidate = item.icons ?? item.icon ?? meta?.icons;
	const icons = toIconArray(candidate);
	for (const icon of icons) {
		if (isRecord(icon) && typeof icon.src === "string") {
			return icon.src;
		}
	}
	return undefined;
};

const toSchema = (value: unknown): JsonSchema | undefined => {
	if (!value) return undefined;
	const record = toCapabilityRecord(value);
	if (!record) return undefined;
	const nested = toCapabilityRecord(record.schema);
	if (nested) return nested as JsonSchema;
	return record as JsonSchema;
};

const toArguments = (value: unknown): CapabilityArgument[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	return value.map((entry, index) => {
		if (!isRecord(entry)) {
			return { name: `arg_${index}` };
		}
		const name = asString(entry.name) ?? `arg_${index}`;
		const type = asString(entry.type);
		const description = asString(entry.description);
		const required =
			typeof entry.required === "boolean" ? entry.required : undefined;
		return {
			name,
			type: type ?? undefined,
			description: description ?? undefined,
			required,
		};
	});
};

const resolveInputSchema = (
	source: CapabilityRecord,
): JsonSchema | undefined => {
	const candidates = [source.input_schema, source.inputSchema, source.schema];
	for (const candidate of candidates) {
		const schema = toSchema(candidate);
		if (schema) {
			if (!schema.type && schema.properties) {
				schema.type = "object";
			}
			return schema;
		}
	}
	return undefined;
};

const resolveOutputSchema = (
	source: CapabilityRecord,
): JsonSchema | undefined => {
	const candidates = [source.output_schema, source.outputSchema];
	for (const candidate of candidates) {
		const schema = toSchema(candidate);
		if (schema) {
			if (!schema.type && schema.properties) {
				schema.type = "object";
			}
			return schema;
		}
	}
	return undefined;
};

function mapItem<T>(kind: CapabilityKind, item: T): CapabilityMapItem<T> {
	const record = toCapabilityRecord(item) ?? ({} as CapabilityRecord);
	if (kind === "tools") {
		const unique = asString(record.unique_name);
		const name = asString(record.tool_name) || asString(record.name);
		const title = unique || name || asString(record.id) || "Untitled Tool";
		const description = normalizeMultiline(asString(record.description));
		const schema = resolveInputSchema(record);
		const outputSchema = resolveOutputSchema(record);
		const args = toArguments(record.arguments);
		return {
			title,
			subtitle: undefined, // 去掉原始工具名称显示
			description,
			server: asString(record.server_name),
			raw: item,
			schema,
			outputSchema,
			args,
			icon: extractIconSrc(record),
		};
	}

	if (kind === "resources") {
		const title =
			asString(record.resource_uri) ||
			asString(record.uri) ||
			asString(record.name) ||
			"Resource";
		const description = normalizeMultiline(asString(record.description));
		return {
			title,
			subtitle: asString(record.name),
			server: asString(record.server_name),
			mime: asString(record.mime_type),
			description,
			raw: item,
			icon: extractIconSrc(record),
		};
	}

	if (kind === "prompts") {
		const title =
			asString(record.prompt_name) || asString(record.name) || "Prompt";
		const description = normalizeMultiline(asString(record.description));
		const args = toArguments(record.arguments);
		return {
			title,
			server: asString(record.server_name),
			description,
			args,
			raw: item,
			icon: extractIconSrc(record),
		};
	}

	const title =
		asString(record.uri_template) || asString(record.name) || "Template";
	const description = normalizeMultiline(asString(record.description));
	return {
		title,
		subtitle: asString(record.server_name),
		description,
		raw: item,
		icon: extractIconSrc(record),
	};
}

function matchText<T>(obj: CapabilityMapItem<T>, needle: string): boolean {
	if (!needle) return true;
	const lower = needle.toLowerCase();
	try {
		const fields = [obj.title, obj.subtitle, obj.server, obj.description]
			.filter(Boolean)
			.join(" \n ")
			.toLowerCase();
		if (fields.includes(lower)) return true;
		return JSON.stringify(obj.raw).toLowerCase().includes(lower);
	} catch {
		return false;
	}
}

export function CapabilityList<T = CapabilityRecord>({
	title,
	kind,
	context = "server",
	items,
	loading,
	filterText,
	onFilterTextChange,
	emptyText,
	enableToggle,
	getId,
	getEnabled,
	onToggle,
	selectable,
	selectedIds,
	onSelectToggle,
	asCard,
	renderAction,
}: CapabilityListProps<T>) {
	const [internalFilter, setInternalFilter] = useState("");
	const search = filterText ?? internalFilter;
	const showRawJson = useAppStore(
		(state) => state.dashboardSettings.showRawCapabilityJson,
	);
	const { t } = useTranslation();

	const mappedItems = useMemo(
		() => (items || []).map((it) => mapItem(kind, it)),
		[items, kind],
	);
	const data = useMemo(
		() => mappedItems.filter((m) => matchText(m, search)),
		[mappedItems, search],
	);

	const skeleton = (
		<div className="space-y-2">
			{[1, 2, 3].map((i) => (
				<div
					key={i}
					className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800"
				/>
			))}
		</div>
	);

	const renderedItems = data.map((mapped, idx) => {
		const item = mapped.raw;
		const id = getId ? getId(item) : String(idx);
		const isSelected = !!(selectable && selectedIds?.includes(id));
		const isEnabled = getEnabled ? !!getEnabled(item) : undefined;

		const handleSelect = () => {
			if (selectable && onSelectToggle) onSelectToggle(id, item);
		};

		const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
			if (!selectable || !onSelectToggle) return;
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				onSelectToggle(id, item);
			}
		};

		const schemaEntries = mapped.schema?.properties
			? Object.entries(mapped.schema.properties)
			: [];
		const outputSchemaEntries = mapped.outputSchema?.properties
			? Object.entries(mapped.outputSchema.properties)
			: [];
		const hasArgs = Boolean(mapped.args?.length);
		const hasSchema = schemaEntries.length > 0;
		const hasOutSchema = outputSchemaEntries.length > 0;
		const hasRaw = showRawJson && mapped.raw != null;
		const hasDetails = hasArgs || hasSchema || hasOutSchema || hasRaw;

		const indicatorClass = isSelected
			? "border-primary bg-primary text-white shadow-sm"
			: "border-slate-300 text-transparent group-hover:border-primary/50 group-hover:text-primary/60 dark:border-slate-700 dark:group-hover:border-primary/50";

		const titleClasses =
			context === "profile" && isSelected
				? "font-medium text-primary"
				: "font-medium";

		const avatarNode = (
			<CachedAvatar
				src={mapped.icon}
				fallback={mapped.title || kind}
				size="sm"
				className="border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
			/>
		);

		const descriptionBlock = mapped.description ? (
			<div className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
				{mapped.description}
			</div>
		) : null;

		const detailsBlock = hasDetails ? (
			<details className="mt-2">
				<summary className="cursor-pointer text-xs text-slate-500">
					{t("servers:capabilityList.detailsToggle", {
						defaultValue: "Details",
					})}
				</summary>
				<div className="mt-2 space-y-2">
					{hasArgs ? (
						<div className="overflow-x-auto">
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.argument", {
												defaultValue: "Argument",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.required", {
												defaultValue: "Required",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.description", {
												defaultValue: "Description",
											})}
										</th>
									</tr>
								</thead>
								<tbody>
									{mapped.args?.map((arg, argIdx) => (
										<tr key={`${arg.name ?? `arg_${argIdx}`}-${argIdx}`}>
											<td className="border-b py-1 pr-2 font-mono">
												{arg.name ?? `arg_${argIdx}`}
											</td>
											<td className="border-b py-1 pr-2">
												{arg.required
													? t("servers:capabilityList.table.requiredYes", {
															defaultValue: "Yes",
														})
													: t("servers:capabilityList.table.requiredNo", {
															defaultValue: "No",
														})}
											</td>
											<td className="border-b py-1 pr-2">
												{arg.description ?? ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}

					{hasSchema ? (
						<div className="overflow-x-auto">
							<div className="mb-1 text-xs text-slate-500">
								{t("servers:capabilityList.inputSchemaTitle", {
									defaultValue: "Input Schema",
								})}
							</div>
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.property", {
												defaultValue: "Property",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.type", {
												defaultValue: "Type",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.description", {
												defaultValue: "Description",
											})}
										</th>
									</tr>
								</thead>
								<tbody>
									{schemaEntries.map(([key, prop]) => {
										const typedProp = prop as Record<string, unknown>;
										const typeValue = Array.isArray(typedProp.type)
											? typedProp.type.join("|")
											: typedProp.type;
										return (
											<tr key={key}>
												<td className="border-b py-1 pr-2 font-mono">{key}</td>
												<td className="border-b py-1 pr-2">
													{String(typeValue ?? "-")}
												</td>
												<td className="border-b py-1 pr-2">
													{String(typedProp.description ?? "")}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					) : null}

					{hasOutSchema ? (
						<div className="overflow-x-auto">
							<div className="mb-1 text-xs text-slate-500">
								{t("servers:capabilityList.outputSchemaTitle", {
									defaultValue: "Output Schema",
								})}
							</div>
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.property", {
												defaultValue: "Property",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.type", {
												defaultValue: "Type",
											})}
										</th>
										<th className="border-b py-1 pr-2">
											{t("servers:capabilityList.table.description", {
												defaultValue: "Description",
											})}
										</th>
									</tr>
								</thead>
								<tbody>
									{outputSchemaEntries.map(([key, prop]) => {
										const typedProp = prop as Record<string, unknown>;
										const typeValue = Array.isArray(typedProp.type)
											? typedProp.type.join("|")
											: typedProp.type;
										return (
											<tr key={key}>
												<td className="border-b py-1 pr-2 font-mono">{key}</td>
												<td className="border-b py-1 pr-2">
													{String(typeValue ?? "-")}
												</td>
												<td className="border-b py-1 pr-2">
													{String(typedProp.description ?? "")}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					) : null}

					{hasRaw ? (
						<pre className="max-w-full whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">
							{JSON.stringify(mapped.raw, null, 2)}
						</pre>
					) : null}
				</div>
			</details>
		) : null;

		const infoBlock = (
			<div className="min-w-0 flex-1">
				<div className={titleClasses}>
					{mapped.title}
					{mapped.subtitle ? (
						<span className="ml-2 text-xs text-slate-500">
							{mapped.subtitle}
						</span>
					) : null}
				</div>
				{mapped.mime ? (
					<div className="text-sm text-slate-500">Mime: {mapped.mime}</div>
				) : null}
				{mapped.server ? (
					<div className="text-sm text-slate-500">Server: {mapped.server}</div>
				) : null}
				{descriptionBlock}
				{detailsBlock}
			</div>
		);

		const leftSection = (
			<div className="flex flex-1 items-start gap-3">
				{avatarNode}
				{infoBlock}
			</div>
		);

		// Build actions node - always show switch for profile context
		const actions = (
			<>
				{context === "profile" && enableToggle && getEnabled && onToggle ? (
					<Switch
						checked={!!isEnabled}
						onCheckedChange={(next) => onToggle(id, next, item)}
						onClick={(e) => e.stopPropagation()}
					/>
				) : null}
					{renderAction ? (
						<div
							role="presentation"
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
								}
							}}
						>
							{renderAction(mapped, item)}
						</div>
					) : null}
			</>
		);

		const actionSection = (
			<div className="ml-auto flex items-start gap-2">{actions}</div>
		);

		if (context === "profile") {
			return (
				<CapsuleStripeListItem
					key={id}
					interactive={!!selectable}
					className={`group relative transition-colors ${
						isSelected ? "bg-primary/10 ring-1 ring-primary/40" : ""
					}`}
					onClick={selectable ? handleSelect : undefined}
					onKeyDown={selectable ? handleKeyDown : undefined}
				>
					<div className="flex w-full items-center gap-3">
						<div
							className={`flex h-6 w-6 items-center justify-center rounded-full border text-[0px] transition-all duration-200 ${indicatorClass}`}
						>
							<Check className="h-3 w-3" />
						</div>
						{leftSection}
						{actionSection}
					</div>
				</CapsuleStripeListItem>
			);
		}

		return (
			<li
				key={id}
				className={`rounded border p-3 ${isSelected ? "bg-accent/50 ring-1 ring-primary/40" : ""}`}
				role={selectable ? "button" : undefined}
				tabIndex={selectable ? 0 : undefined}
				onClick={handleSelect}
				onKeyDown={handleKeyDown}
			>
				<div className="flex items-start justify-between gap-3">
					{leftSection}
					{actionSection}
				</div>
			</li>
		);
	});

	const listContent =
		context === "profile" ? (
			<CapsuleStripeList>{renderedItems}</CapsuleStripeList>
		) : (
			<ul className="space-y-4 text-sm">{renderedItems}</ul>
		);

	const list = (
		<div>
			{loading ? (
				skeleton
			) : renderedItems.length ? (
				listContent
			) : (
				<div className="text-sm text-slate-500">
					{emptyText ||
						t("servers:capabilityList.emptyFallback", {
							defaultValue: "No data.",
						})}
				</div>
			)}
		</div>
	);

	if (asCard === false) {
		return list;
	}

	const showSearch =
		typeof onFilterTextChange === "function" || filterText === undefined;
	const kindLabel = t(`servers:detail.capabilityList.labels.${kind}`, {
		defaultValue: kind[0].toUpperCase() + kind.slice(1),
	});
	const searchPlaceholder = t("servers:capabilityList.searchPlaceholder", {
		label: kindLabel,
		defaultValue: `Search ${kind}...`,
	});

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>{title ?? kindLabel}</CardTitle>
					{showSearch ? (
						<Input
							placeholder={searchPlaceholder}
							className="w-56"
							value={search}
							onChange={(event) => {
								if (onFilterTextChange) onFilterTextChange(event.target.value);
								else setInternalFilter(event.target.value);
							}}
						/>
					) : null}
				</div>
			</CardHeader>
			<CardContent>{list}</CardContent>
		</Card>
	);
}

export default CapabilityList;
