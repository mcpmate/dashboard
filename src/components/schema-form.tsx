import { Info } from "lucide-react";
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
import { Switch } from "./ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

export type JSONSchema = any; // Lightweight compatibility

export function defaultFromSchema(schema: JSONSchema): any {
	try {
		if (!schema) return {};
		if (schema.default !== undefined) return schema.default;
		const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
		if (schema.enum && schema.enum.length) return schema.enum[0];
		switch ((t || "object").toLowerCase()) {
			case "string":
				return schema.examples?.[0] ?? "example";
			case "integer":
				return 1;
			case "number":
				return 1;
			case "boolean":
				return true;
			case "array": {
				const item = defaultFromSchema(schema.items || { type: "string" });
				return [item];
			}
			case "object": {
				const o: Record<string, any> = {};
				const props = schema.properties || {};
				Object.keys(props).forEach((k) => {
					o[k] = defaultFromSchema(props[k]);
				});
				return o;
			}
			default:
				return "example";
		}
	} catch {
		return {};
	}
}

type FieldProps = {
	name: string;
	schema: JSONSchema;
	required?: boolean;
	value: any;
	onChange: (v: any) => void;
};

function sanitizeId(input: string) {
	return input.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function Field({ name, schema, required, value, onChange }: FieldProps) {
	const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
	const enumVals: any[] | undefined = schema?.enum;
	const labelText = `${name}${required ? " *" : ""}`;
	const desc = schema?.description as string | undefined;
	const fieldId = `schema-${sanitizeId(name)}`;
	const labelId = `${fieldId}-label`;

	const labelNode = desc ? (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Label
						id={labelId}
						htmlFor={fieldId}
						className="flex cursor-help select-none items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-200"
					>
						<span>{labelText}</span>
						<Info className="h-2.5 w-2.5 relative -top-0.5" />
					</Label>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					align="start"
					className="max-w-xs leading-relaxed"
				>
					{desc}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	) : (
		<Label
			id={labelId}
			htmlFor={fieldId}
			className="select-none text-sm font-medium text-slate-600 dark:text-slate-200"
		>
			{labelText}
		</Label>
	);

	const renderField = (control: React.ReactNode) => (
		<div className="grid grid-cols-[minmax(140px,200px)_1fr] items-start gap-3">
			<div className="pt-2">{labelNode}</div>
			<div className="space-y-2" aria-labelledby={labelId}>
				{control}
			</div>
		</div>
	);

	if (enumVals && enumVals.length) {
		return renderField(
			<Select
				value={String(value ?? enumVals[0])}
				onValueChange={(v) => onChange(v)}
			>
				<SelectTrigger id={fieldId} aria-labelledby={labelId}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{enumVals.map((e, i) => (
						<SelectItem key={`${name}-${i}`} value={String(e)}>
							{String(e)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>,
		);
	}

	if (type === "boolean") {
		return renderField(
			<div className="flex items-center gap-2">
				<Switch
					id={fieldId}
					aria-labelledby={labelId}
					checked={!!value}
					onCheckedChange={(v) => onChange(v)}
				/>
				<span className="text-xs text-slate-500">{String(value)}</span>
			</div>,
		);
	}

	if (type === "integer" || type === "number") {
		return renderField(
			<Input
				id={fieldId}
				type="number"
				value={value ?? ""}
				onChange={(e) =>
					onChange(
						e.target.value === ""
							? undefined
							: type === "integer"
								? parseInt(e.target.value)
								: parseFloat(e.target.value),
					)
				}
			/>,
		);
	}

	if (type === "array") {
		const itemsSchema = schema?.items || { type: "string" };
		const arr: any[] = Array.isArray(value) ? value : [];
		return renderField(
			<div className="space-y-2">
				{arr.map((v, idx) => (
					<div
						key={`${name}-${idx}`}
						className="grid grid-cols-[1fr_auto] items-end gap-2"
					>
						<Field
							name={`${name}[${idx}]`}
							schema={itemsSchema}
							value={v}
							onChange={(nv) => {
								const next = [...arr];
								next[idx] = nv;
								onChange(next);
							}}
						/>
						<button
							type="button"
							className="text-xs rounded border px-2 py-1 hover:bg-accent"
							onClick={() => {
								const next = arr.filter((_, i) => i !== idx);
								onChange(next);
							}}
						>
							Remove
						</button>
					</div>
				))}
				<button
					type="button"
					className="text-xs rounded border px-2 py-1 hover:bg-accent"
					onClick={() => {
						onChange([...(arr || []), defaultFromSchema(itemsSchema)]);
					}}
				>
					Add item
				</button>
			</div>,
		);
	}

	if (type === "object") {
		const props = schema?.properties || {};
		const req: string[] = Array.isArray(schema?.required)
			? schema.required
			: [];
		const obj: Record<string, any> =
			value && typeof value === "object" ? value : {};
		const keys = Object.keys(props);
		return renderField(
			<div className="grid grid-cols-1 gap-3">
				{keys.map((k) => (
					<Field
						key={k}
						name={k}
						schema={props[k]}
						required={req.includes(k)}
						value={obj[k]}
						onChange={(nv) => onChange({ ...obj, [k]: nv })}
					/>
				))}
			</div>,
		);
	}

	// string and fallback
	return renderField(
		schema?.format === "textarea" ? (
			<Textarea
				id={fieldId}
				rows={4}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
			/>
		) : (
			<Input
				id={fieldId}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
			/>
		),
	);
}

export function SchemaForm({
	schema,
	value,
	onChange,
}: {
	schema: JSONSchema;
	value: any;
	onChange: (v: any) => void;
}) {
	const props = schema?.properties || {};
	const req: string[] = Array.isArray(schema?.required) ? schema.required : [];
	const keys = Object.keys(props);
	const obj: Record<string, any> =
		value && typeof value === "object" ? value : {};
	return (
		<div className="grid grid-cols-1 gap-3">
			{keys.map((k) => (
				<Field
					key={k}
					name={k}
					schema={props[k]}
					required={req.includes(k)}
					value={obj[k]}
					onChange={(nv) => onChange({ ...obj, [k]: nv })}
				/>
			))}
		</div>
	);
}
