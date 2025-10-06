import { Input } from "../../ui/input";
import { FieldList } from "../field-list";

interface UrlParamsProps {
	viewMode: "form" | "json";
	isStdio: boolean;
	urlParamFields: Array<{ id: string; [key: string]: unknown }>;
	removeUrlParam: (index: number) => void;
	appendUrlParam: (value: { key: string; value: string }) => void;
	register: any;
	deleteConfirmStates: Record<string, boolean>;
	onDeleteClick: (fieldId: string, removeFn: () => void) => void;
	onGhostClick: (addFn: () => void) => void;
}

export function UrlParams({
	viewMode,
	isStdio,
	urlParamFields,
	removeUrlParam,
	appendUrlParam,
	register,
	deleteConfirmStates,
	onDeleteClick,
	onGhostClick,
}: UrlParamsProps) {
	if (viewMode !== "form" || isStdio) return null;

	return (
		<FieldList
			label="URL Parameters"
			fields={urlParamFields}
			onRemove={removeUrlParam}
			deleteConfirmStates={deleteConfirmStates}
			onDeleteClick={onDeleteClick}
			renderField={(field, index) => {
				if (field.id === "ghost") {
					return (
						<div className="grid grid-cols-2 gap-2">
							<Input
								placeholder="Parameter name"
								onClick={() =>
									onGhostClick(() => appendUrlParam({ key: "", value: "" }))
								}
								className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
								readOnly
							/>
							<Input
								placeholder="Value"
								onClick={() =>
									onGhostClick(() => appendUrlParam({ key: "", value: "" }))
								}
								className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
								readOnly
							/>
						</div>
					);
				}
				return (
					<div className="grid grid-cols-2 gap-2">
						<Input
							{...register(`urlParams.${index}.key` as const)}
							placeholder="Parameter"
						/>
						<Input
							{...register(`urlParams.${index}.value` as const)}
							placeholder="Value"
						/>
					</div>
				);
			}}
		/>
	);
}
