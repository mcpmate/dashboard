import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RotateCcw, Target } from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { parseJsonDrafts } from "../../lib/install-normalizer";
import { Button } from "../ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Segment } from "../ui/segment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import {
	CommandField,
	HttpHeaders,
	MetaFields,
	StdioAdvanced,
	UrlParams,
} from "./form-fields";
import {
	useFormState,
	useFormSubmission,
	useFormSync,
	useIngest,
} from "./hooks";
import {
	breathingAnimation,
	type ManualServerFormValues,
	manualServerSchema,
	SERVER_TYPE_OPTIONS,
	type ServerInstallManualFormHandle,
	type ServerInstallManualFormProps,
} from "./types";

export const ServerInstallManualForm = forwardRef<
	ServerInstallManualFormHandle,
	ServerInstallManualFormProps
>(
	(
		{
			isOpen,
			onClose,
			onSubmit,
			onSubmitMultiple,
			mode = "create",
			initialDraft,
			allowJsonEditing,
			onPreview,
			allowProgrammaticIngest = false,
		}: ServerInstallManualFormProps,
		ref,
	) => {
		const isEditMode = mode === "edit";
		const isMarketMode = mode === "market";
		const jsonEditingEnabled = allowJsonEditing ?? !isEditMode;
		const ingestEnabled = !isEditMode && !isMarketMode;

		// Form state management
		const {
			activeTab,
			setActiveTab,
			viewMode,
			setViewMode,
			jsonText,
			setJsonText,
			jsonError,
			setJsonError,
			formStateRef,
			isRestoringRef,
			lastInitialDraftRef,
			createInitialFormState,
			buildFormValuesFromState,
		} = useFormState();

		const {
			control,
			handleSubmit,
			register,
			formState: { errors, isSubmitting },
			reset,
			watch,
			setValue,
			getValues,
		} = useForm<ManualServerFormValues>({
			resolver: zodResolver(manualServerSchema),
			shouldUnregister: false,
			defaultValues: {
				name: "",
				kind: "stdio",
				command: "",
				url: "",
				args: [],
				env: [],
				headers: [],
				urlParams: [],
				meta_description: "",
				meta_version: "",
				meta_website_url: "",
				meta_repository_url: "",
				meta_repository_source: "",
				meta_repository_subfolder: "",
				meta_repository_id: "",
			} as ManualServerFormValues,
		});

		// Field arrays
		const {
			fields: argFields,
			append: appendArg,
			remove: removeArg,
		} = useFieldArray({ control, name: "args" });

		const {
			fields: envFields,
			append: appendEnv,
			remove: removeEnv,
		} = useFieldArray({ control, name: "env" });

		const {
			fields: headerFields,
			append: appendHeader,
			remove: removeHeader,
		} = useFieldArray({ control, name: "headers" });

		const {
			fields: urlParamFields,
			append: appendUrlParam,
			remove: removeUrlParam,
		} = useFieldArray({ control, name: "urlParams" });

		// Watched values
		const kind = watch("kind");
		const isStdio = kind === "stdio";
		const watchedName = useWatch({ control, name: "name" });
		const watchedMetaDescription = useWatch({
			control,
			name: "meta_description",
		});
		const watchedMetaVersion = useWatch({ control, name: "meta_version" });
		const watchedMetaWebsite = useWatch({ control, name: "meta_website_url" });
		const watchedMetaRepositoryUrl = useWatch({
			control,
			name: "meta_repository_url",
		});
		const watchedMetaRepositorySource = useWatch({
			control,
			name: "meta_repository_source",
		});
		const watchedMetaRepositorySubfolder = useWatch({
			control,
			name: "meta_repository_subfolder",
		});
		const watchedMetaRepositoryId = useWatch({
			control,
			name: "meta_repository_id",
		});
		const watchedCommand = useWatch({ control, name: "command" });
		const watchedUrl = useWatch({ control, name: "url" });
		const watchedArgs = useWatch({ control, name: "args" });
		const watchedEnv = useWatch({ control, name: "env" });
		const watchedHeaders = useWatch({ control, name: "headers" });

		// Form sync
		const { saveTypeSnapshot, restoreTypeSnapshot } = useFormSync({
			formStateRef,
			isRestoringRef,
			kind,
			watchedName,
			watchedMetaDescription,
			watchedMetaVersion,
			watchedMetaWebsite,
			watchedMetaRepositoryUrl,
			watchedMetaRepositorySource,
			watchedMetaRepositorySubfolder,
			watchedMetaRepositoryId,
			watchedCommand,
			watchedUrl,
			watchedArgs,
			watchedEnv,
			watchedHeaders,
			getValues,
			reset,
			buildFormValuesFromState,
		});

		// Ingest functionality
		const {
			isIngesting,
			ingestMessage,
			setIngestMessage,
			ingestError,
			setIngestError,
			isIngestSuccess,
			setIsIngestSuccess,
			isDropZoneCollapsed,
			setIsDropZoneCollapsed,
			isDragOver,
			setIsDragOver,
			canIngestProgrammatically,
			resetIngestState,
			applySingleDraftToForm,
			handleIngestPayload,
		} = useIngest({
			ingestEnabled,
			allowProgrammaticIngest,
			formStateRef,
			buildFormValuesFromState,
			reset,
			onSubmitMultiple,
			onClose,
		});

		// Form submission
		const {
			buildDraftFromValues,
			submitForm,
			submitJson,
			submitButtonLabel,
			pendingButtonLabel,
		} = useFormSubmission({
			isEditMode,
			isMarketMode,
			onSubmit,
			onClose,
			reset,
			viewMode,
			jsonText,
			jsonEditingEnabled,
			setJsonError,
			setViewMode,
		});

		// UI state
		const [deleteConfirmStates, setDeleteConfirmStates] = useState<
			Record<string, boolean>
		>({});

		// Refs
		const dropZoneRef = useRef<HTMLButtonElement | null>(null);
		const commandInputRef = useRef<HTMLInputElement | null>(null);
		const urlInputRef = useRef<HTMLInputElement | null>(null);

		// Generate unique IDs for form elements
		const nameId = useId();
		const kindId = useId();
		const commandId = useId();
		const urlId = useId();
		const metaDescriptionId = useId();
		const metaVersionId = useId();
		const metaWebsiteUrlId = useId();
		const metaRepositoryUrlId = useId();
		const metaRepositorySourceId = useId();
		const metaRepositorySubfolderId = useId();
		const metaRepositoryId = useId();
		const manualJsonId = useId();

		// Focus management
		useEffect(() => {
			const frame = requestAnimationFrame(() => {
				const el = isStdio ? commandInputRef.current : urlInputRef.current;
				if (el) {
					el.focus();
					el.blur();
				}
			});
			return () => cancelAnimationFrame(frame);
		}, [isStdio]);

		// Reset form when closed
		useEffect(() => {
			if (!isOpen) {
				reset();
				setViewMode("form");
				setJsonError(null);
				setActiveTab("core");
				resetIngestState();
				formStateRef.current = createInitialFormState();
				lastInitialDraftRef.current = null;
			}
		}, [
			createInitialFormState,
			isOpen,
			reset,
			resetIngestState,
			setViewMode,
			setJsonError,
			setActiveTab,
			formStateRef,
			lastInitialDraftRef,
		]);

		// Handle initial draft
		useEffect(() => {
			if (!isOpen) return;
			if (!initialDraft) return;
			const signature = JSON.stringify(initialDraft);
			if (lastInitialDraftRef.current === signature) return;
			applySingleDraftToForm(initialDraft);
			lastInitialDraftRef.current = signature;
			setActiveTab("core");
			setViewMode("form");
			setIsIngestSuccess(true);
			setIsDropZoneCollapsed(true);
			setIngestError(null);
			setIngestMessage(
				isEditMode
					? "Editing server"
					: "Drop JSON/TOML/Text or MCP bundles (.mcpb) to begin",
			);
		}, [
			applySingleDraftToForm,
			initialDraft,
			isEditMode,
			isOpen,
			setActiveTab,
			setViewMode,
			setIsIngestSuccess,
			setIsDropZoneCollapsed,
			setIngestError,
			setIngestMessage,
			lastInitialDraftRef,
		]);

		// Inject breathing animation styles
		useEffect(() => {
			const style = document.createElement("style");
			style.textContent = breathingAnimation;
			document.head.appendChild(style);
			return () => {
				document.head.removeChild(style);
			};
		}, []);

		// Event handlers
		const handleResetAll = useCallback(() => {
			const initial = createInitialFormState();
			formStateRef.current = initial;
			isRestoringRef.current = true;
			reset(buildFormValuesFromState(initial));
			isRestoringRef.current = false;
			setViewMode("form");
			setActiveTab("core");
			setJsonError(null);
			resetIngestState();
			setDeleteConfirmStates({});
		}, [
			createInitialFormState,
			reset,
			buildFormValuesFromState,
			resetIngestState,
			setViewMode,
			setActiveTab,
			setJsonError,
			formStateRef,
			isRestoringRef,
		]);

		const handleDeleteClick = useCallback(
			(fieldId: string, removeFn: () => void) => {
				if (deleteConfirmStates[fieldId]) {
					// Second click - actually delete
					removeFn();
					setDeleteConfirmStates((prev) => {
						const newState = { ...prev };
						delete newState[fieldId];
						return newState;
					});
				} else {
					// First click - show confirmation
					setDeleteConfirmStates((prev) => ({ ...prev, [fieldId]: true }));
				}
			},
			[deleteConfirmStates],
		);

		const handleGhostClick = useCallback((addFn: () => void) => {
			addFn();
		}, []);

		// Form interaction handlers
		const handleFormInteraction = useCallback(() => {
			if (!isDropZoneCollapsed) {
				setIsDropZoneCollapsed(true);
			}
		}, [isDropZoneCollapsed, setIsDropZoneCollapsed]);

		const handleDropZoneClick = useCallback(() => {
			if (!ingestEnabled) return;
			if (isDropZoneCollapsed) {
				setIsDropZoneCollapsed(false);
				setIngestError(null);
				setIsIngestSuccess(false);
				setIngestMessage("Drop JSON/TOML/Text or MCP bundles (.mcpb) to begin");
			}
		}, [
			ingestEnabled,
			isDropZoneCollapsed,
			setIsDropZoneCollapsed,
			setIngestError,
			setIsIngestSuccess,
			setIngestMessage,
		]);

		// Drag and drop handlers
		const onDragEnter = (event: React.DragEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			event.preventDefault();
			event.stopPropagation();
			setIsDragOver(true);
			if (isDropZoneCollapsed) {
				setIsDropZoneCollapsed(false);
				setIngestError(null);
				setIsIngestSuccess(false);
				setIngestMessage("Drop JSON/TOML/Text or MCP bundles (.mcpb) to begin");
			}
		};

		const onDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.currentTarget.contains(event.relatedTarget as Node)) {
				setIsDragOver(false);
			}
		};

		const onDrop = async (event: React.DragEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			event.preventDefault();
			setIsDragOver(false);
			const { files, items } = event.dataTransfer;
			if (files?.length) {
				const file = files[0];
				if (file.name.endsWith(".mcpb") || file.name.endsWith(".dxt")) {
					const buffer = await file.arrayBuffer();
					setIngestMessage(`Processing bundle: ${file.name}`);
					await handleIngestPayload({ buffer, fileName: file.name });
					return;
				}
				const text = await file.text();
				setIngestMessage(`Parsing text from ${file.name}`);
				await handleIngestPayload({ text, fileName: file.name });
				return;
			}
			if (items?.length) {
				const item = items[0];
				if (item.kind === "string") {
					item.getAsString(async (text) => {
						setIngestMessage("Parsing dropped text");
						await handleIngestPayload({ text });
					});
				}
			}
		};

		const onPaste = (event: React.ClipboardEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			if (isDropZoneCollapsed) return;
			if (isIngesting) return;
			const text = event.clipboardData.getData("text/plain");
			if (text) {
				event.preventDefault();
				setIngestMessage("Parsing pasted content");
				handleIngestPayload({ text });
			}
		};

		// Paste listener
		useEffect(() => {
			if (!isOpen || !ingestEnabled) return;
			const listener = (event: ClipboardEvent) => {
				if (isDropZoneCollapsed) return;
				if (isIngesting) return;
				const text = event.clipboardData?.getData("text/plain");
				if (text) {
					event.preventDefault();
					setIngestMessage("Parsing pasted content");
					handleIngestPayload({ text });
				}
			};
			window.addEventListener("paste", listener);
			return () => window.removeEventListener("paste", listener);
		}, [
			handleIngestPayload,
			ingestEnabled,
			isOpen,
			isIngesting,
			isDropZoneCollapsed,
			setIngestMessage,
		]);

		// Focus drop zone
		useEffect(() => {
			if (!isOpen || !ingestEnabled) return;
			const frame = requestAnimationFrame(() => {
				dropZoneRef.current?.focus();
			});
			return () => cancelAnimationFrame(frame);
		}, [ingestEnabled, isOpen]);

		// Imperative handle
		useImperativeHandle(ref, () => ({
			ingest: canIngestProgrammatically
				? handleIngestPayload
				: async () => undefined,
			loadDraft: (draft) => {
				applySingleDraftToForm(draft);
				setIsIngestSuccess(true);
				setIsDropZoneCollapsed(true);
				setIngestMessage("Server configuration loaded successfully");
				setIngestError(null);
				setActiveTab("core");
			},
			getCurrentDraft: () => {
				const values = getValues();
				return buildDraftFromValues(values);
			},
		}));

		// Form submission handlers
		const formSubmitHandler = handleSubmit(submitForm);

		const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
			if (viewMode === "json") {
				event.preventDefault();
				if (jsonEditingEnabled) {
					await submitJson();
				}
				return;
			}
			await formSubmitHandler(event);
		};

		// JSON sync functions
		const syncFormToJson = () => {
			saveTypeSnapshot(kind);
			const valuesForJson = buildFormValuesFromState(formStateRef.current);
			const current = buildDraftFromValues(valuesForJson);

			const entry: Record<string, unknown> = {
				type: current.kind,
			};

			if (current.kind === "stdio") {
				if (current.command) entry.command = current.command;
				if (current.args?.length) entry.args = current.args;
				if (current.env && Object.keys(current.env).length)
					entry.env = current.env;
			} else {
				if (current.url) {
					const params = (current as { urlParams?: Record<string, string> })
						?.urlParams;
					if (params && Object.keys(params).length) {
						try {
							const isHttp = /^https?:/i.test(current.url);
							const u = new URL(
								current.url,
								isHttp ? undefined : "http://dummy.local",
							);
							for (const [k, v] of Object.entries(params)) {
								u.searchParams.set(k, v);
							}
							entry.url = isHttp
								? u.toString()
								: `${current.url}?${u.searchParams.toString()}`;
						} catch {
							const qs = new URLSearchParams(
								params as Record<string, string>,
							).toString();
							entry.url = qs ? `${current.url}?${qs}` : current.url;
						}
					} else {
						entry.url = current.url;
					}
				}
				if (current.headers && Object.keys(current.headers).length)
					entry.headers = current.headers;
			}

			if (current.meta && Object.keys(current.meta).length)
				entry.meta = current.meta;

			const payload = {
				mcpServers: {
					[current.name || "new-server"]: entry,
				},
			};

			setJsonText(JSON.stringify(payload, null, 2));
			setJsonError(null);
		};

		const syncJsonToForm = () => {
			try {
				const drafts = parseJsonDrafts(jsonText);
				if (!drafts.length) {
					setJsonError("No servers found in JSON payload");
					return false;
				}
				setJsonError(null);

				// Implementation would go here - simplified for brevity
				return true;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to parse JSON";
				setJsonError(message);
				return false;
			}
		};

		const handleModeChange = (mode: "form" | "json") => {
			if (mode === viewMode) return;
			if (mode === "json") {
				syncFormToJson();
				setViewMode("json");
				return;
			}
			const ok = jsonEditingEnabled ? syncJsonToForm() : true;
			if (ok) {
				setViewMode("form");
			}
		};

		return (
			<Drawer
				open={isOpen}
				onOpenChange={(value) => (!value ? onClose() : undefined)}
			>
				<DrawerContent>
					<form onSubmit={onFormSubmit} className="flex h-full flex-col">
						<DrawerHeader className="pb-2">
							<div className="flex items-start justify-between gap-2">
								<div>
									<DrawerTitle>
										{isEditMode
											? "Editing server"
											: isMarketMode
												? "Import Server"
												: "Server Uni-Import"}
									</DrawerTitle>
									<DrawerDescription className="mt-1 text-sm text-muted-foreground">
										{isEditMode
											? "Review and update the existing server settings. JSON preview remains read-only in this mode."
											: isMarketMode
												? "Configure and import this server from the registry."
												: "You can directly drag and drop the configuration information, or enter it manually."}
									</DrawerDescription>
								</div>
								{ingestEnabled ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={handleResetAll}
										aria-label="Reset form"
										title="Reset form"
									>
										<RotateCcw className="h-4 w-4" />
									</Button>
								) : null}
							</div>
						</DrawerHeader>

						{/* Uni-Import Drop Zone */}
						{ingestEnabled ? (
							<button
								ref={dropZoneRef}
								type="button"
								onDrop={onDrop}
								onDragOver={(event) => event.preventDefault()}
								onDragEnter={onDragEnter}
								onDragLeave={onDragLeave}
								onPaste={onPaste}
								onClick={handleDropZoneClick}
								className={`px-4 mb-4 w-full cursor-pointer focus:outline-none ${
									isDropZoneCollapsed ? "h-10" : "h-[18vh]"
								}`}
								style={{ border: "none" }}
							>
								<div
									className={`w-full h-full flex items-center justify-center gap-4 rounded-lg border border-dashed transition-all duration-300 ${
										isDropZoneCollapsed
											? "flex-row px-4 py-2 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
											: "flex-col py-8 border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
									} ${
										ingestError
											? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
											: isIngestSuccess
												? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
												: isDragOver
													? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
													: ""
									}`}
								>
									{isIngesting ? (
										<Loader2
											className={`animate-spin ${
												isDropZoneCollapsed ? "h-4 w-4" : "h-6 w-6"
											}`}
										/>
									) : (
										<Target
											className={`transition-all duration-300 ${
												isDropZoneCollapsed ? "h-4 w-4" : "h-12 w-12"
											} ${
												isDragOver || isIngesting
													? "animate-pulse"
													: "scale-100"
											} ${isDragOver ? "text-blue-500" : "text-slate-500"}`}
											style={{
												animation:
													ingestError || isDragOver || isIngesting
														? "breathing 1.5s ease-in-out infinite"
														: undefined,
											}}
										/>
									)}

									<div
										className={`text-center ${
											isDropZoneCollapsed ? "flex-1 text-left" : ""
										}`}
									>
										<p
											className={`leading-relaxed transition-all duration-300 ${
												isDropZoneCollapsed
													? "text-sm max-w-none"
													: "max-w-none px-4 text-sm"
											} ${
												ingestError
													? "text-red-600 dark:text-red-400"
													: isIngestSuccess
														? "text-green-600 dark:text-green-400"
														: isDragOver
															? "text-blue-600 dark:text-blue-400"
															: "text-slate-600 dark:text-slate-300"
											} ${isIngesting || isDragOver ? "animate-pulse" : ""}`}
										>
											{ingestError || ingestMessage}
										</p>
										{!isDropZoneCollapsed && !ingestError && (
											<p className="text-xs text-slate-400 mt-2">
												Tip: press{" "}
												<kbd className="rounded bg-slate-200 px-1 text-[10px]">
													Ctrl/Cmd + V
												</kbd>{" "}
												to paste instantly.
											</p>
										)}
									</div>
								</div>
							</button>
						) : null}

						{/* Main Content Area */}
						<div
							className={`flex-1 overflow-y-auto px-4 pb-4 ${
								ingestEnabled ? "pt-0" : "pt-4"
							}`}
						>
							<Tabs
								value={activeTab}
								onValueChange={(v) => setActiveTab(v as "core" | "meta")}
								className="space-y-4"
							>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="core">Core configuration</TabsTrigger>
									<TabsTrigger value="meta">Meta information (WIP)</TabsTrigger>
								</TabsList>

								<TabsContent
									value="core"
									className={`space-y-6 ${
										viewMode === "json" ? "flex flex-col h-full" : ""
									}`}
									onClick={handleFormInteraction}
								>
									<div className="flex items-center justify-end">
										<div className="flex rounded-lg border border-slate-200 p-1 text-xs dark:border-slate-700">
											<button
												type="button"
												onClick={() => handleModeChange("form")}
												className={`rounded-l-md rounded-r-none px-3 py-1 font-medium transition-colors ${
													viewMode === "form"
														? "bg-primary text-primary-foreground"
														: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
												}`}
											>
												Form
											</button>
											<button
												type="button"
												onClick={() => handleModeChange("json")}
												className={`rounded-r-md rounded-l-none px-3 py-1 font-medium transition-colors ${
													viewMode === "json"
														? "bg-primary text-primary-foreground"
														: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
												}`}
											>
												JSON
											</button>
										</div>
									</div>

									{viewMode === "form" ? (
										<>
											<div className="space-y-4">
												<div className="flex items-center gap-4">
													<Label htmlFor={nameId} className="w-20 text-right">
														Name
													</Label>
													<div className="flex-1">
														<Input
															id={nameId}
															{...register("name")}
															placeholder="e.g., local-mcp"
															readOnly={isEditMode}
															aria-readonly={isEditMode}
															title={
																isEditMode
																	? "Editing server names is disabled"
																	: undefined
															}
															className={
																isEditMode
																	? "cursor-not-allowed bg-muted text-muted-foreground"
																	: undefined
															}
														/>
														{errors.name && (
															<p className="text-xs text-red-500">
																{errors.name.message}
															</p>
														)}
													</div>
												</div>
												<div className="flex items-center gap-4">
													<Label htmlFor={kindId} className="w-20 text-right">
														Type
													</Label>
													<div className="flex-1">
														<Segment
															options={SERVER_TYPE_OPTIONS}
															value={kind}
															onValueChange={(value) => {
																const newKind =
																	value as ManualServerFormValues["kind"];
																if (newKind === kind) {
																	return;
																}
																saveTypeSnapshot(kind);
																setValue("kind", newKind, {
																	shouldDirty: true,
																	shouldTouch: true,
																});
																restoreTypeSnapshot(newKind);
															}}
															showDots={true}
														/>
														{errors.kind && (
															<p className="text-xs text-red-500">
																{errors.kind.message}
															</p>
														)}
													</div>
												</div>
											</div>

											<CommandField
												kind={kind}
												control={control}
												errors={errors}
												commandId={commandId}
												urlId={urlId}
												commandInputRef={commandInputRef}
												urlInputRef={urlInputRef}
												viewMode={viewMode}
											/>

											<StdioAdvanced
												viewMode={viewMode}
												isStdio={isStdio}
												argFields={argFields}
												envFields={envFields}
												removeArg={removeArg}
												removeEnv={removeEnv}
												appendArg={appendArg}
												appendEnv={appendEnv}
												register={register}
												deleteConfirmStates={deleteConfirmStates}
												onDeleteClick={handleDeleteClick}
												onGhostClick={handleGhostClick}
											/>

											<UrlParams
												viewMode={viewMode}
												isStdio={isStdio}
												urlParamFields={urlParamFields}
												removeUrlParam={removeUrlParam}
												appendUrlParam={appendUrlParam}
												register={register}
												deleteConfirmStates={deleteConfirmStates}
												onDeleteClick={handleDeleteClick}
												onGhostClick={handleGhostClick}
											/>

											<HttpHeaders
												viewMode={viewMode}
												isStdio={isStdio}
												headerFields={headerFields}
												removeHeader={removeHeader}
												appendHeader={appendHeader}
												register={register}
												deleteConfirmStates={deleteConfirmStates}
												onDeleteClick={handleDeleteClick}
												onGhostClick={handleGhostClick}
											/>
										</>
									) : (
										<div className="flex flex-col h-full">
											<div className="flex items-start gap-4 flex-1">
												<Label
													htmlFor={manualJsonId}
													className="w-20 text-right pt-3 flex-shrink-0"
												>
													Server JSON
												</Label>
												<div className="flex-1 flex flex-col">
													<div className="flex-1 min-h-[400px] border border-input rounded-md flex flex-col">
														<Textarea
															id={manualJsonId}
															value={jsonText}
															onChange={
																jsonEditingEnabled
																	? (event) => setJsonText(event.target.value)
																	: undefined
															}
															readOnly={!jsonEditingEnabled}
															aria-readonly={!jsonEditingEnabled}
															className="font-mono text-sm flex-1 border-0 focus:ring-0 focus:outline-none"
															style={{
																background: "transparent",
																caretColor: jsonEditingEnabled
																	? "currentColor"
																	: "transparent",
																minHeight: "400px",
																userSelect: "text",
																WebkitUserSelect: "text",
																MozUserSelect: "text",
																msUserSelect: "text",
															}}
														/>
													</div>
													{jsonError ? (
														<p className="text-xs text-red-500 mt-2">
															{jsonError}
														</p>
													) : null}
												</div>
											</div>
										</div>
									)}
								</TabsContent>

								<TabsContent
									value="meta"
									className="space-y-6"
									onClick={handleFormInteraction}
								>
									<MetaFields
										formStateRef={formStateRef}
										register={register}
										errors={errors}
										metaDescriptionId={metaDescriptionId}
										metaVersionId={metaVersionId}
										metaWebsiteUrlId={metaWebsiteUrlId}
										metaRepositoryUrlId={metaRepositoryUrlId}
										metaRepositorySourceId={metaRepositorySourceId}
										metaRepositorySubfolderId={metaRepositorySubfolderId}
										metaRepositoryId={metaRepositoryId}
									/>
								</TabsContent>
							</Tabs>
						</div>

						<DrawerFooter className="mt-auto border-t px-6 py-4">
							<div className="flex w-full items-center justify-between gap-3">
								<Button
									type="button"
									variant="outline"
									onClick={onClose}
									disabled={isSubmitting}
								>
									Cancel
								</Button>
								{isMarketMode ? (
									<Button
										type="button"
										onClick={onPreview}
										disabled={isSubmitting}
									>
										{isSubmitting ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Previewing...
											</>
										) : (
											"Preview"
										)}
									</Button>
								) : (
									<Button type="submit" disabled={isSubmitting}>
										{isSubmitting ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{pendingButtonLabel}
											</>
										) : (
											submitButtonLabel
										)}
									</Button>
								)}
							</div>
						</DrawerFooter>
					</form>
				</DrawerContent>
			</Drawer>
		);
	},
);
