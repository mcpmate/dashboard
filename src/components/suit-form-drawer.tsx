import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { configSuitsApi } from "../lib/api";
import type {
	ConfigSuit,
	ConfigSuitResource,
	ConfigSuitServer,
	ConfigSuitTool,
	ConfigSuitPrompt,
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
import { notifyError, notifySuccess } from "../lib/notify";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const KNOWN_PROFILE_TYPES: Array<{ value: string; label: string }> = [
	{ value: "host_app", label: "Host Application" },
	{ value: "scenario", label: "Scenario" },
	{ value: "shared", label: "Shared" },
];

const formatProfileTypeLabel = (value: string) =>
	value
		.split(/[\s_]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

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
	const queryClient = useQueryClient();

	// Form state
	const [formData, setFormData] = useState<{
		name: string;
		description: string;
		suit_type: string;
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

	const [activeTab, setActiveTab] = useState<"manual" | "clone">("manual");

	// Reset form data when dialog opens or mode/suit changes
	useEffect(() => {
		if (open) {
			setActiveTab("manual");
			if (mode === "edit" && suit) {
				setFormData({
					name: suit.name,
					description: suit.description || "",
					suit_type: suit.suit_type,
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

	useEffect(() => {
		if (activeTab === "manual") {
			setFormData((prev) => ({ ...prev, clone_from_id: "none" }));
		}
	}, [activeTab]);

	// Fetch all suits for cloning option
	const { data: suitsResponse } = useQuery({
		queryKey: ["configSuits"],
		queryFn: configSuitsApi.getAll,
		enabled: open,
	});

	const availableSuits = suitsResponse?.suits || [];
	const defaultSuitId = useMemo(
		() => availableSuits.find((profile) => profile.is_default)?.id,
		[availableSuits],
	);

	const profileTypeOptions = useMemo(() => {
		const typeMap = new Map<string, string>();
		KNOWN_PROFILE_TYPES.forEach(({ value, label }) =>
			typeMap.set(value, label),
		);
		availableSuits.forEach((profile) => {
			if (!typeMap.has(profile.suit_type)) {
				typeMap.set(
					profile.suit_type,
					formatProfileTypeLabel(profile.suit_type),
				);
			}
		});
		if (formData.suit_type && !typeMap.has(formData.suit_type)) {
			typeMap.set(
				formData.suit_type,
				formatProfileTypeLabel(formData.suit_type),
			);
		}
		return Array.from(typeMap.entries()).map(([value, label]) => ({
			value,
			label,
		}));
	}, [availableSuits, formData.suit_type]);
	const clonePreviewEnabled =
		activeTab === "clone" && formData.clone_from_id !== "none";
	const { data: cloneContent, isFetching: clonePreviewLoading } = useQuery<{
		servers: ConfigSuitServer[];
		tools: ConfigSuitTool[];
		resources: ConfigSuitResource[];
		prompts: ConfigSuitPrompt[];
	}>({
		queryKey: ["configSuitClonePreview", formData.clone_from_id],
		queryFn: async () => {
			const [serversResult, toolsResult, resourcesResult, promptsResult] =
				await Promise.allSettled([
					configSuitsApi.getServers(formData.clone_from_id),
					configSuitsApi.getTools(formData.clone_from_id),
					configSuitsApi.getResources(formData.clone_from_id),
					configSuitsApi.getPrompts(formData.clone_from_id),
				]);
			return {
				servers:
					serversResult.status === "fulfilled"
						? serversResult.value.servers || []
						: [],
				tools:
					toolsResult.status === "fulfilled"
						? toolsResult.value.tools || []
						: [],
				resources:
					resourcesResult.status === "fulfilled"
						? resourcesResult.value.resources || []
						: [],
				prompts:
					promptsResult.status === "fulfilled"
						? promptsResult.value.prompts || []
						: [],
			};
		},
		enabled: clonePreviewEnabled,
		staleTime: 30_000,
	});

	// Create mutation
	const createMutation = useMutation({
		mutationFn: configSuitsApi.createSuit,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			notifySuccess("Created", "Profile created successfully");
			onOpenChange(false);
			onSuccess?.();
		},
		onError: (error: Error) => {
			notifyError("Create failed", error.message || "Failed to create profile");
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateConfigSuitRequest }) =>
			configSuitsApi.updateSuit(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["configSuits"] });
			queryClient.invalidateQueries({ queryKey: ["configSuit", suit?.id] });
			notifySuccess("Updated", "Profile updated successfully");
			onOpenChange(false);
			onSuccess?.();
		},
		onError: (error: Error) => {
			notifyError("Update failed", error.message || "Failed to update profile");
		},
	});

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		// Basic validation
		if (!formData.name.trim()) {
			notifyError("Validation failed", "Name is required");
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
				clone_from_id:
					formData.clone_from_id && formData.clone_from_id !== "none"
						? formData.clone_from_id
						: undefined,
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

	const showDefaultToggle =
		mode === "edit"
			? !defaultSuitId || defaultSuitId === suit?.id
			: !defaultSuitId;

	useEffect(() => {
		if (!showDefaultToggle) {
			setFormData((prev) =>
				prev.is_default ? { ...prev, is_default: false } : prev,
			);
		}
	}, [showDefaultToggle]);

	const clonePreview = useMemo(() => {
		if (activeTab !== "clone" || formData.clone_from_id === "none") {
			return null;
		}
		const selected = availableSuits.find(
			(profile) => profile.id === formData.clone_from_id,
		);
		if (!selected) {
			return null;
		}

		const serverCount = cloneContent?.servers?.length ?? 0;
		const toolCount = cloneContent?.tools?.length ?? 0;
		const resourceCount = cloneContent?.resources?.length ?? 0;
		const promptCount = cloneContent?.prompts?.length ?? 0;

		const details = [
			{ label: "Type", value: formatProfileTypeLabel(selected.suit_type) },
			{ label: "Priority", value: selected.priority ?? "—" },
			{ label: "Multi-select", value: selected.multi_select ? "Yes" : "No" },
			{ label: "Status", value: selected.is_active ? "Active" : "Inactive" },
			{ label: "Servers", value: serverCount },
			{ label: "Tools", value: toolCount },
			{ label: "Resources", value: resourceCount },
			{ label: "Prompts", value: promptCount || "—" },
		];

		return (
			<div>
				<div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
					{details.map(({ label, value }) => (
						<div
							key={label}
							className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
						>
							<span className="text-xs tracking-wide text-muted-foreground">
								{label}
							</span>
							<span className="text-base text-slate-900 dark:text-slate-100">
								{value}
							</span>
						</div>
					))}
				</div>
				{clonePreviewLoading && (
					<p className="mt-3 text-xs text-muted-foreground">
						Loading capabilities…
					</p>
				)}
			</div>
		);
	}, [activeTab, availableSuits, cloneContent, formData.clone_from_id]);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>
						{mode === "create" ? "Create New Profile" : "Edit Profile"}
					</DrawerTitle>
					<DrawerDescription>
						{mode === "create"
							? "Create a new profile to organize your MCP servers and tools."
							: "Update the profile settings."}
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
					<form onSubmit={handleSubmit} className="space-y-6 max-w-full">
						<div className="flex items-center gap-4">
							<Label
								htmlFor={nameId}
								className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
							>
								Name *
							</Label>
							<Input
								id={nameId}
								value={formData.name}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, name: e.target.value }))
								}
								placeholder="Enter profile name"
								required
								className="flex-1"
							/>
						</div>

						<div className="flex items-start gap-4">
							<Label
								htmlFor={descriptionId}
								className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
							>
								Description
							</Label>
							<Textarea
								id={descriptionId}
								value={formData.description}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
								placeholder="Provide a short summary"
								rows={3}
								className="flex-1"
							/>
						</div>

						{mode === "create" ? (
							<Tabs
								value={activeTab}
								onValueChange={(value) =>
									setActiveTab(value as "manual" | "clone")
								}
								className="space-y-4"
							>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="manual">Manual</TabsTrigger>
									<TabsTrigger value="clone">Clone</TabsTrigger>
								</TabsList>

								<TabsContent value="manual" className="space-y-4">
									<div className="flex items-center gap-4">
										<Label
											htmlFor={suitTypeId}
											className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
										>
											Profile Type
										</Label>
										<Select
											value={formData.suit_type}
											onValueChange={(value) =>
												setFormData((prev) => ({ ...prev, suit_type: value }))
											}
										>
											<SelectTrigger id={suitTypeId} className="flex-1">
												<SelectValue placeholder="Select profile type" />
											</SelectTrigger>
											<SelectContent>
												{profileTypeOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="flex items-start gap-4">
										<Label
											htmlFor={priorityId}
											className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
										>
											Priority
										</Label>
										<div className="flex-1 space-y-1">
											<Input
												id={priorityId}
												type="number"
												min="0"
												max="100"
												value={formData.priority}
												onChange={(e) =>
													setFormData((prev) => ({
														...prev,
														priority: parseInt(e.target.value, 10) || 0,
													}))
												}
												className="flex-1"
											/>
											<p className="text-xs text-muted-foreground">
												0-100, higher value gets evaluated first
											</p>
										</div>
									</div>

									<div className="flex items-center gap-4">
										<span className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300">
											Allow Multiple
										</span>
										<div className="flex items-center gap-2">
											<Switch
												id={multiSelectId}
												checked={formData.multi_select}
												onCheckedChange={(checked) =>
													setFormData((prev) => ({
														...prev,
														multi_select: checked,
													}))
												}
											/>
											<Label htmlFor={multiSelectId} className="text-sm">
												Allow selection of multiple servers
											</Label>
										</div>
									</div>

									<div className="flex items-center gap-4">
										<span className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300">
											Status
										</span>
										<div className="flex flex-wrap items-center gap-6">
											<div className="flex items-center gap-2">
												<Switch
													id={isActiveId}
													checked={formData.is_active}
													onCheckedChange={(checked) =>
														setFormData((prev) => ({
															...prev,
															is_active: checked,
														}))
													}
												/>
												<Label htmlFor={isActiveId} className="text-sm">
													Activate immediately
												</Label>
											</div>
											{showDefaultToggle && (
												<div className="flex items-center gap-2">
													<Switch
														id={isDefaultId}
														checked={formData.is_default}
														onCheckedChange={(checked) =>
															setFormData((prev) => ({
																...prev,
																is_default: checked,
															}))
														}
													/>
													<Label htmlFor={isDefaultId} className="text-sm">
														Set as default profile
													</Label>
												</div>
											)}
										</div>
									</div>
								</TabsContent>

								<TabsContent value="clone" className="space-y-4">
									<div className="flex items-center gap-4">
										<Label
											htmlFor={cloneFromId}
											className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
										>
											Clone From
										</Label>
										<Select
											value={formData.clone_from_id}
											onValueChange={(value) =>
												setFormData((prev) => ({
													...prev,
													clone_from_id: value,
												}))
											}
										>
											<SelectTrigger id={cloneFromId} className="flex-1">
												<SelectValue placeholder="Select a profile" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">None</SelectItem>
												{availableSuits.map((profile) => (
													<SelectItem key={profile.id} value={profile.id}>
														{profile.name} ({profile.suit_type})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									{clonePreview}
									<p className="ml-32 text-sm text-muted-foreground al">
										Cloning copies enabled servers, tools, and resources from
										the source profile.
									</p>
								</TabsContent>
							</Tabs>
						) : (
							<div className="space-y-4">
								<div className="flex items-center gap-4">
									<Label
										htmlFor={suitTypeId}
										className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
									>
										Profile Type
									</Label>
									<Select
										value={formData.suit_type}
										onValueChange={(value) =>
											setFormData((prev) => ({ ...prev, suit_type: value }))
										}
									>
										<SelectTrigger id={suitTypeId} className="flex-1">
											<SelectValue placeholder="Select profile type" />
										</SelectTrigger>
										<SelectContent>
											{profileTypeOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="flex items-start gap-4">
									<Label
										htmlFor={priorityId}
										className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300"
									>
										Priority
									</Label>
									<div className="flex-1 space-y-1">
										<Input
											id={priorityId}
											type="number"
											min="0"
											max="100"
											value={formData.priority}
											onChange={(e) =>
												setFormData((prev) => ({
													...prev,
													priority: parseInt(e.target.value, 10) || 0,
												}))
											}
											className="flex-1"
										/>
										<p className="text-xs text-muted-foreground">
											0-100, higher value gets evaluated first
										</p>
									</div>
								</div>

								<div className="flex items-center gap-4">
									<span className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300">
										Allow Multiple
									</span>
									<div className="flex items-center gap-2">
										<Switch
											id={multiSelectId}
											checked={formData.multi_select}
											onCheckedChange={(checked) =>
												setFormData((prev) => ({
													...prev,
													multi_select: checked,
												}))
											}
										/>
										<Label htmlFor={multiSelectId} className="text-sm">
											Allow selection of multiple servers
										</Label>
									</div>
								</div>

								<div className="flex items-center gap-4">
									<span className="w-32 text-sm font-medium text-slate-600 dark:text-slate-300">
										Status
									</span>
									<div className="flex flex-wrap items-center gap-6">
										<div className="flex items-center gap-2">
											<Switch
												id={isActiveId}
												checked={formData.is_active}
												onCheckedChange={(checked) =>
													setFormData((prev) => ({
														...prev,
														is_active: checked,
													}))
												}
											/>
											<Label htmlFor={isActiveId} className="text-sm">
												Activate immediately
											</Label>
										</div>
										{showDefaultToggle && (
											<div className="flex items-center gap-2 hidden">
												<Switch
													id={isDefaultId}
													checked={formData.is_default}
													onCheckedChange={(checked) =>
														setFormData((prev) => ({
															...prev,
															is_default: checked,
														}))
													}
												/>
												<Label htmlFor={isDefaultId} className="text-sm">
													Set as default profile
												</Label>
											</div>
										)}
									</div>
								</div>
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
							{isLoading
								? "Saving..."
								: mode === "create"
									? "Create"
									: "Update"}
						</Button>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
