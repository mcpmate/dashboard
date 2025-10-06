import { Controller } from "react-hook-form";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import type { ManualServerFormValues } from "../types";

interface CommandFieldProps {
	kind: ManualServerFormValues["kind"];
	control: any;
	errors: any;
	commandId: string;
	urlId: string;
	commandInputRef: React.RefObject<HTMLInputElement>;
	urlInputRef: React.RefObject<HTMLInputElement>;
	viewMode: "form" | "json";
}

export function CommandField({
	kind,
	control,
	errors,
	commandId,
	urlId,
	commandInputRef,
	urlInputRef,
	viewMode,
}: CommandFieldProps) {
	if (viewMode !== "form") return null;

	const isStdio = kind === "stdio";

	return isStdio ? (
		<div key={`stdio-${kind}`} className="flex items-center gap-4">
			<Label htmlFor={commandId} className="w-20 text-right">
				Command
			</Label>
			<div className="flex-1">
				<Controller
					name="command"
					control={control}
					render={({ field }) => (
						<Input
							id={commandId}
							{...field}
							ref={(el) => {
								field.ref(el);
								commandInputRef.current = el;
							}}
							placeholder="e.g., uvx my-mcp"
						/>
					)}
				/>
				{errors.command && (
					<p className="text-xs text-red-500">{errors.command.message}</p>
				)}
			</div>
		</div>
	) : (
		<div key={`url-${kind}`} className="flex items-center gap-4">
			<Label htmlFor={urlId} className="w-20 text-right">
				Server URL
			</Label>
			<div className="flex-1">
				<Controller
					name="url"
					control={control}
					render={({ field }) => (
						<Input
							id={urlId}
							{...field}
							ref={(el) => {
								field.ref(el);
								urlInputRef.current = el;
							}}
							placeholder="https://example.com/mcp"
						/>
					)}
				/>
				{errors.url && (
					<p className="text-xs text-red-500">{errors.url.message}</p>
				)}
			</div>
		</div>
	);
}
