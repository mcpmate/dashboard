import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useAppStore } from "../lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { CachedAvatar } from "./cached-avatar";
import {
	CapsuleStripeList,
	CapsuleStripeListItem,
} from "./capsule-stripe-list";

type CapabilityKind = "tools" | "resources" | "prompts" | "templates";
type ContextType = "server" | "profile";

export interface CapabilityListProps<T = any> {
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
	renderAction?: (mapped: any, item: T) => ReactNode;
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

function extractIconSrc(item: any): string | undefined {
	if (!item) return undefined;
	const candidate = item.icons ?? item.icon ?? item.meta?.icons;
	const icons = Array.isArray(candidate)
		? candidate
		: candidate
			? [candidate]
			: [];
	const match = icons.find(
		(icon: any) =>
			icon && typeof icon === "object" && typeof icon.src === "string",
	);
	return typeof match?.src === "string" ? match.src : undefined;
}

function mapItem(kind: CapabilityKind, item: any) {
	if (kind === "tools") {
		const unique = asString(item.unique_name);
		const name = asString(item.tool_name) || asString(item.name);
		const title = unique || name || asString(item.id) || "Untitled Tool";
		const description = normalizeMultiline(asString(item.description));
		const schema =
			item?.input_schema?.schema ||
			item?.inputSchema?.schema ||
			item?.input_schema ||
			item?.inputSchema ||
			item?.schema ||
			undefined;
		const outputSchema =
			item?.output_schema?.schema ||
			item?.outputSchema?.schema ||
			item?.output_schema ||
			item?.outputSchema ||
			undefined;
		const args = Array.isArray(item.arguments) ? item.arguments : undefined;
		return {
			title,
			subtitle: unique && name && unique !== name ? `Name: ${name}` : undefined,
			description,
			server: asString(item.server_name),
			raw: item,
			schema,
			outputSchema,
			args,
			icon: extractIconSrc(item),
		};
	}

	if (kind === "resources") {
		const title =
			asString(item.resource_uri) ||
			asString(item.uri) ||
			asString(item.name) ||
			"Resource";
		const description = normalizeMultiline(asString(item.description));
		return {
			title,
			subtitle: asString(item.name),
			server: asString(item.server_name),
			mime: asString(item.mime_type),
			description,
			raw: item,
			icon: extractIconSrc(item),
		};
	}

	if (kind === "prompts") {
		const title = asString(item.prompt_name) || asString(item.name) || "Prompt";
		const description = normalizeMultiline(asString(item.description));
		const args = Array.isArray(item.arguments) ? item.arguments : undefined;
		return {
			title,
			server: asString(item.server_name),
			description,
			args,
			raw: item,
			icon: extractIconSrc(item),
		};
	}

	const title =
		asString(item.uri_template) || asString(item.name) || "Template";
	const description = normalizeMultiline(asString(item.description));
	return {
		title,
		subtitle: asString(item.server_name),
		description,
		raw: item,
		icon: extractIconSrc(item),
	};
}

function matchText(obj: any, needle: string): boolean {
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

export function CapabilityList<T = any>({
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
		const item = (items as any[])[idx];
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

		const hasArgs = Array.isArray(mapped.args) && mapped.args.length > 0;
		const hasSchema =
			mapped.schema &&
			typeof mapped.schema === "object" &&
			mapped.schema?.properties &&
			Object.keys(mapped.schema.properties).length > 0;
		const hasOutSchema =
			mapped.outputSchema &&
			typeof mapped.outputSchema === "object" &&
			mapped.outputSchema?.properties &&
			Object.keys(mapped.outputSchema.properties).length > 0;
		const hasRaw = !!mapped.raw && showRawJson;
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
					Details
				</summary>
				<div className="mt-2 space-y-2">
					{hasArgs ? (
						<div className="overflow-x-auto">
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">Argument</th>
										<th className="border-b py-1 pr-2">Required</th>
										<th className="border-b py-1 pr-2">Description</th>
									</tr>
								</thead>
								<tbody>
									{mapped.args.map((arg: any, argIdx: number) => (
										<tr key={argIdx}>
											<td className="border-b py-1 pr-2 font-mono">
												{asString(arg.name) || `arg_${argIdx}`}
											</td>
											<td className="border-b py-1 pr-2">
												{String(!!arg.required)}
											</td>
											<td className="border-b py-1 pr-2">
												{asString(arg.description) || ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}

					{hasSchema ? (
						<div className="overflow-x-auto">
							<div className="mb-1 text-xs text-slate-500">Input Schema</div>
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">Property</th>
										<th className="border-b py-1 pr-2">Type</th>
										<th className="border-b py-1 pr-2">Description</th>
									</tr>
								</thead>
								<tbody>
									{Object.keys(mapped.schema.properties).map((key) => {
										const prop = (mapped.schema.properties as any)[key];
										return (
											<tr key={key}>
												<td className="border-b py-1 pr-2 font-mono">{key}</td>
												<td className="border-b py-1 pr-2">
													{asString(prop?.type) ||
														(Array.isArray(prop?.type)
															? prop.type.join("|")
															: "-")}
												</td>
												<td className="border-b py-1 pr-2">
													{asString(prop?.description) || ""}
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
							<div className="mb-1 text-xs text-slate-500">Output Schema</div>
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="text-left text-slate-500">
										<th className="border-b py-1 pr-2">Property</th>
										<th className="border-b py-1 pr-2">Type</th>
										<th className="border-b py-1 pr-2">Description</th>
									</tr>
								</thead>
								<tbody>
									{Object.keys(mapped.outputSchema.properties).map((key) => {
										const prop = (mapped.outputSchema.properties as any)[key];
										return (
											<tr key={key}>
												<td className="border-b py-1 pr-2 font-mono">{key}</td>
												<td className="border-b py-1 pr-2">
													{asString(prop?.type) ||
														(Array.isArray(prop?.type)
															? prop.type.join("|")
															: "-")}
												</td>
												<td className="border-b py-1 pr-2">
													{asString(prop?.description) || ""}
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
			<div className="flex flex-1 items-center gap-3">
				{avatarNode}
				{infoBlock}
			</div>
		);

		const actionSection = (
			<div className="ml-auto flex items-center gap-2">
				{context === "profile" && enableToggle && getEnabled && onToggle ? (
					<div
						className="flex items-center gap-2 text-xs"
						onClick={(e) => e.stopPropagation()}
					>
						{isEnabled ? (
							<Badge>Enabled</Badge>
						) : (
							<Badge variant="outline">Disabled</Badge>
						)}
						<Switch
							checked={!!isEnabled}
							onCheckedChange={(next) => onToggle(id, next, item)}
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
				) : null}
				{renderAction ? (
					<div onClick={(e) => e.stopPropagation()}>
						{renderAction(mapped, item)}
					</div>
				) : null}
			</div>
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
				<div className="text-sm text-slate-500">{emptyText || "No data."}</div>
			)}
		</div>
	);

	if (asCard === false) {
		return list as any;
	}

	const showSearch =
		typeof onFilterTextChange === "function" || filterText === undefined;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>
						{title ?? kind[0].toUpperCase() + kind.slice(1)}
					</CardTitle>
					{showSearch ? (
						<Input
							placeholder={`Search ${kind}...`}
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
