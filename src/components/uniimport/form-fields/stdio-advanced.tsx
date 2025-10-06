import { Input } from "../../ui/input";
import { FieldList } from "../field-list";

interface StdioAdvancedProps {
	viewMode: "form" | "json";
	isStdio: boolean;
	argFields: Array<{ id: string; [key: string]: unknown }>;
	envFields: Array<{ id: string; [key: string]: unknown }>;
	removeArg: (index: number) => void;
	removeEnv: (index: number) => void;
	appendArg: (value: { value: string }) => void;
	appendEnv: (value: { key: string; value: string }) => void;
	register: any;
	deleteConfirmStates: Record<string, boolean>;
	onDeleteClick: (fieldId: string, removeFn: () => void) => void;
	onGhostClick: (addFn: () => void) => void;
}

export function StdioAdvanced({
	viewMode,
	isStdio,
	argFields,
	envFields,
	removeArg,
	removeEnv,
	appendArg,
	appendEnv,
	register,
	deleteConfirmStates,
	onDeleteClick,
	onGhostClick,
}: StdioAdvancedProps) {
	if (viewMode !== "form" || !isStdio) return null;

	return (
		<div className="space-y-6">
			<FieldList
				label="Arguments"
				fields={argFields}
				onRemove={removeArg}
				deleteConfirmStates={deleteConfirmStates}
				onDeleteClick={onDeleteClick}
				renderField={(field, index) => {
					if (field.id === "ghost") {
						return (
							<Input
								placeholder="Add a new argument"
								onClick={() => onGhostClick(() => appendArg({ value: "" }))}
								className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
								readOnly
							/>
						);
					}
					return (
						<Input
							{...register(`args.${index}.value` as const)}
							placeholder={`Argument ${index + 1}`}
							className="pr-8"
						/>
					);
				}}
			/>
			<FieldList
				label="Environment Variables"
				fields={envFields}
				onRemove={removeEnv}
				deleteConfirmStates={deleteConfirmStates}
				onDeleteClick={onDeleteClick}
				renderField={(field, index) => {
					if (field.id === "ghost") {
						return (
							<div className="grid grid-cols-2 gap-2">
								<Input
									placeholder="Add a new key"
									onClick={() =>
										onGhostClick(() => appendEnv({ key: "", value: "" }))
									}
									className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
									readOnly
								/>
								<Input
									placeholder="Add a new value"
									onClick={() =>
										onGhostClick(() => appendEnv({ key: "", value: "" }))
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
								{...register(`env.${index}.key` as const)}
								placeholder="KEY"
							/>
							<Input
								{...register(`env.${index}.value` as const)}
								placeholder="Value"
							/>
						</div>
					);
				}}
			/>
		</div>
	);
}
