import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { configSuitsApi } from "../lib/api";
import type {
	ConfigSuit,
	CreateConfigSuitRequest,
	UpdateConfigSuitRequest,
} from "../lib/types";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/use-toast";

interface SuitFormDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	suit?: ConfigSuit;
	onSuccess?: () => void;
}

export function SuitFormDrawer({
	open,
	onOpenChange,
	mode,
	suit,
	onSuccess,
}: SuitFormDrawerProps) {
	const { toast } = useToast();
	const queryClient = useQueryClient();

	// Form state
	const [formData, setFormData] = useState<{
		name: string;
		description: string;
		suit_type: "scenario" | "tool";
		multi_select: boolean;
		priority: number;
		is_active: boolean;
		is_default: boolean;
		clone_from_id: string;
	}>({
		name: "",
		description: "",
		suit_type: "scenario",
		multi_select: false,
		priority: 50,
		is_active: false,
		is_default: false,
		clone_from_id: "none",
	});

	// Generate unique IDs for form elements
	const nameId = useId();
	const descriptionId = useId();
	const suitTypeId = useId();
	const multiSelectId = useId();
	const priorityId = useId();
	const isActiveId = useId();
	const isDefaultId = useId();
	const cloneFromId = useId();

	// Reset form data when dialog opens or mode/suit changes
	useEffect(() => {
		if (open) {
			if (mode === "edit" && suit) {
				setFormData({
					name: suit.name,
					description: suit.description || "",
					suit_type: suit.suit_type as "scenario" | "tool",
					multi_select: suit.multi_select,
					priority: suit.priority,
					is_active: suit.is_active,
					is_default: suit.is_default,
					clone_from_id: "none", // Not applicable in edit mode
				});
			} else {
				// Create mode - reset to empty form
				setFormData({
					name: "",
					description: "",
					suit_type: "scenario",
					multi_select: false,
					priority: 50,
					is_active: false,
					is_default: false,
					clone_from_id: "none",
				});
			}
		}
	}, [open, mode, suit]);

	// Fetch all suits for cloning option
	const { data: suitsResponse } = useQuery({
		queryKey: ["configSuits"],
		queryFn: configSuitsApi.getAll,
		enabled: mode === "create",
	});

	const availableSuits = suitsResponse?.suits || [];

	// Create mutation
	const createMutation = useMutation({
		mutationFn: configSuitsApi.createSuit,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			toast({
				title: "Success",
				description: "Configuration suit created successfully",
			});
			onOpenChange(false);
			onSuccess?.();
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to create configuration suit",
				variant: "destructive",
			});
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateConfigSuitRequest }) =>
			configSuitsApi.updateSuit(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			queryClient.invalidateQueries({ queryKey: ["configSuit", suit?.id] });
			toast({
				title: "Success",
				description: "Configuration suit updated successfully",
			});
			onOpenChange(false);
			onSuccess?.();
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update configuration suit",
				variant: "destructive",
			});
		},
	});

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		// Basic validation
		if (!formData.name.trim()) {
			toast({
				title: "Validation Error",
				description: "Name is required",
				variant: "destructive",
			});
			return;
		}

		if (mode === "create") {
			const createData: CreateConfigSuitRequest = {
				name: formData.name,
				description: formData.description || undefined,
				suit_type: formData.suit_type,
				multi_select: formData.multi_select,
				priority: formData.priority,
				is_active: formData.is_active,
				is_default: formData.is_default,
				clone_from_id: formData.clone_from_id && formData.clone_from_id !== "none" ? formData.clone_from_id : undefined,
			};
			createMutation.mutate(createData);
		} else if (suit) {
			const updateData: UpdateConfigSuitRequest = {
				name: formData.name !== suit.name ? formData.name : undefined,
				description:
					formData.description !== (suit.description || "")
						? formData.description
						: undefined,
				suit_type:
					formData.suit_type !== suit.suit_type
						? formData.suit_type
						: undefined,
				multi_select:
					formData.multi_select !== suit.multi_select
						? formData.multi_select
						: undefined,
				priority:
					formData.priority !== suit.priority ? formData.priority : undefined,
				is_active:
					formData.is_active !== suit.is_active
						? formData.is_active
						: undefined,
				is_default:
					formData.is_default !== suit.is_default
						? formData.is_default
						: undefined,
			};
			updateMutation.mutate({ id: suit.id, data: updateData });
		}
	};

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[96vh]">
				<DrawerHeader>
					<DrawerTitle>
						{mode === "create" ? "Create New Configuration Suit" : "Edit Configuration Suit"}
					</DrawerTitle>
					<DrawerDescription>
						{mode === "create"
							? "Create a new configuration suit to organize your MCP servers and tools."
							: "Update the configuration suit settings."}
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto px-4">
					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Name */}
						<div className="space-y-2">
							<Label htmlFor={nameId}>Name *</Label>
							<Input
								id={nameId}
								value={formData.name}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, name: e.target.value }))
								}
								placeholder="Enter suit name"
								required
							/>
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor={descriptionId}>Description</Label>
							<Textarea
								id={descriptionId}
								value={formData.description}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
								placeholder="Enter suit description"
								rows={3}
							/>
						</div>

						{/* Suit Type */}
						<div className="space-y-2">
							<Label htmlFor={suitTypeId}>Suit Type</Label>
							<Select
								value={formData.suit_type}
								onValueChange={(value: "scenario" | "tool") =>
									setFormData((prev) => ({ ...prev, suit_type: value }))
								}
							>
								<SelectTrigger id={suitTypeId}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="scenario">Scenario</SelectItem>
									<SelectItem value="tool">Tool</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Priority */}
						<div className="space-y-2">
							<Label htmlFor={priorityId}>Priority</Label>
							<Input
								id={priorityId}
								type="number"
								min="0"
								max="100"
								value={formData.priority}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										priority: parseInt(e.target.value) || 0,
									}))
								}
							/>
							<p className="text-sm text-muted-foreground">
								Priority level (0-100, higher numbers = higher priority)
							</p>
						</div>

						{/* Multi Select */}
						<div className="flex items-center space-x-2">
							<Switch
								id={multiSelectId}
								checked={formData.multi_select}
								onCheckedChange={(checked) =>
									setFormData((prev) => ({ ...prev, multi_select: checked }))
								}
							/>
							<Label htmlFor={multiSelectId}>Allow Multiple Selection</Label>
						</div>

						{/* Is Active */}
						<div className="flex items-center space-x-2">
							<Switch
								id={isActiveId}
								checked={formData.is_active}
								onCheckedChange={(checked) =>
									setFormData((prev) => ({ ...prev, is_active: checked }))
								}
							/>
							<Label htmlFor={isActiveId}>Active</Label>
						</div>

						{/* Is Default */}
						<div className="flex items-center space-x-2">
							<Switch
								id={isDefaultId}
								checked={formData.is_default}
								onCheckedChange={(checked) =>
									setFormData((prev) => ({ ...prev, is_default: checked }))
								}
							/>
							<Label htmlFor={isDefaultId}>Set as Default</Label>
						</div>

						{/* Clone From (only in create mode) */}
						{mode === "create" && (
							<div className="space-y-2">
								<Label htmlFor={cloneFromId}>Clone From</Label>
								<Select
									value={formData.clone_from_id}
									onValueChange={(value) =>
										setFormData((prev) => ({ ...prev, clone_from_id: value }))
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a suit to clone from" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">None</SelectItem>
										{availableSuits.map((s: any) => (
											<SelectItem key={s.id} value={s.id}>
												{s.name} ({s.suit_type})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-sm text-muted-foreground">
									Copy servers and tools from an existing suit
								</p>
							</div>
						)}
					</form>
				</div>

				<DrawerFooter>
					<div className="flex gap-2 w-full">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							onClick={handleSubmit}
							disabled={isLoading}
							className="flex-1"
						>
							{isLoading ? "Saving..." : mode === "create" ? "Create" : "Update"}
						</Button>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
