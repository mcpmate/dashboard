import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Minus, RotateCcw, Target, X } from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { ServerInstallDraft } from "../hooks/use-server-install-pipeline";
import {
	normalizeIngestResult,
	parseJsonDrafts,
} from "../lib/install-normalizer";
import { notifyError } from "../lib/notify";
import type { RegistryRepositoryInfo, ServerMetaInfo } from "../lib/types";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
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
import { Segment, type SegmentOption } from "./ui/segment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

// Constants
const DEFAULT_INGEST_MESSAGE =
	"Drop JSON/TOML/Text or MCP bundles (.mcpb) to begin";

// Server type options for Segment component
const SERVER_TYPE_OPTIONS: SegmentOption[] = [
	{ value: "stdio", label: "Stdio" },
	{ value: "sse", label: "SSE" },
	{ value: "streamable_http", label: "Streamable HTTP" },
];

// Reusable Field List Component
interface FieldListProps {
	label: string;
	fields: Array<{ id: string; [key: string]: unknown }>;
	onRemove: (index: number) => void;
	renderField: (
		field: { id: string; [key: string]: unknown },
		index: number,
	) => React.ReactNode;
	deleteConfirmStates: Record<string, boolean>;
	onDeleteClick: (fieldId: string, removeFn: () => void) => void;
}

const FieldList: React.FC<FieldListProps> = ({
	label,
	fields,
	onRemove,
	renderField,
	deleteConfirmStates,
	onDeleteClick,
}) => {
	return (
		<div className="space-y-0">
			<div className="flex gap-4">
				<Label className="w-20 text-right flex items-center justify-end h-10">
					{label}
				</Label>
				<div className="flex-1 space-y-0">
					{fields.map((field, index) => (
						<div
							key={field.id}
							className="flex items-center gap-2 py-0.5 group"
						>
							<div className="flex-1 relative">
								{renderField(field, index)}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => onDeleteClick(field.id, () => onRemove(index))}
									className={`absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border opacity-0 group-focus-within:opacity-100 transition-opacity ${
										deleteConfirmStates[field.id]
											? "border-red-500 bg-red-50 hover:bg-red-100"
											: "border-slate-300 hover:border-red-500 hover:bg-red-50"
									}`}
								>
									{deleteConfirmStates[field.id] ? (
										<X className="h-3 w-3" />
									) : (
										<Minus className="h-3 w-3" />
									)}
								</Button>
							</div>
						</div>
					))}
					{/* Ghost field for adding new items */}
					<div className="flex items-center gap-2 py-0.5">
						<div className="flex-1 relative">
							{renderField({ id: "ghost" }, fields.length)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

// Add breathing animation styles
const breathingAnimation = `
@keyframes breathing {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}
`;

const argSchema = z.object({
	value: z.string().optional(),
});

const envSchema = z.object({
	key: z.string().optional(),
	value: z.string().optional(),
});

const headerSchema = z.object({
	key: z.string().optional(),
	value: z.string().optional(),
});
const urlParamSchema = z.object({
	key: z.string().optional(),
	value: z.string().optional(),
});

const manualServerSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		kind: z.enum(["stdio", "sse", "streamable_http"], {
			required_error: "Select a server type",
		}),
		command: z.string().optional(),
		url: z.string().url("Provide a valid URL").optional().or(z.literal("")),
		args: z.array(argSchema).optional(),
		env: z.array(envSchema).optional(),
		headers: z.array(headerSchema).optional(),
		urlParams: z.array(urlParamSchema).optional(),
		meta_description: z.string().optional(),
		meta_version: z.string().optional(),
		meta_website_url: z
			.string()
			.url("Provide a valid URL")
			.optional()
			.or(z.literal("")),
		meta_repository_url: z
			.string()
			.url("Provide a valid URL")
			.optional()
			.or(z.literal("")),
		meta_repository_source: z.string().optional(),
		meta_repository_subfolder: z.string().optional(),
		meta_repository_id: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		const kind = value.kind;
		const command = value.command?.trim();
		const url = value.url?.trim();
		if (kind === "stdio" && !command) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Command is required for stdio servers",
				path: ["command"],
			});
		}
		if (kind !== "stdio" && !url) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "URL is required for non-stdio servers",
				path: ["url"],
			});
		}
	});

type ManualServerFormValues = z.infer<typeof manualServerSchema>;

interface KeyValuePair {
	key: string;
	value: string;
}

interface StdioState {
	command: string;
	args: Array<{ value: string }>;
	env: KeyValuePair[];
}

interface HttpState {
	url: string;
	headers: KeyValuePair[];
	urlParams?: KeyValuePair[];
}

interface IconState {
	src: string;
	mimeType?: string;
	sizes?: string;
}

interface ManualFormStateJson {
	name: string;
	kind: ManualServerFormValues["kind"];
	meta: {
		description: string;
		version: string;
		websiteUrl: string;
		repository: {
			url: string;
			source: string;
			subfolder: string;
			id: string;
		};
		icons: IconState[];
	};
	stdio: StdioState;
	sse: HttpState;
	streamable_http: HttpState;
}

const cloneArgs = (
	items?: ManualServerFormValues["args"] | Array<{ value?: string }>,
): Array<{ value: string }> =>
	Array.isArray(items)
		? items.map((item) => ({ value: item?.value ?? "" }))
		: [];

const cloneKeyValuePairs = (
	items?:
		| ManualServerFormValues["env"]
		| ManualServerFormValues["headers"]
		| Array<{ key?: string; value?: string }>,
): KeyValuePair[] =>
	Array.isArray(items)
		? items.map((item) => ({
				key: item?.key ?? "",
				value: item?.value ?? "",
			}))
		: [];

export interface ServerInstallManualFormHandle {
	ingest: (payload: {
		text?: string;
		buffer?: ArrayBuffer;
		fileName?: string;
	}) => Promise<void>;
	loadDraft: (draft: ServerInstallDraft) => Promise<void> | void;
	getCurrentDraft: () => ServerInstallDraft | null;
}

interface ServerInstallManualFormProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (draft: ServerInstallDraft) => Promise<void> | void;
	onSubmitMultiple?: (drafts: ServerInstallDraft[]) => Promise<void> | void;
	/**
	 * Controls whether the form behaves as a creation flow, edit experience, or market import.
	 * Edit mode disables ingest-only UX like drag & drop and forces JSON view to be read-only.
	 * Market mode shows server information and transport options for registry imports.
	 */
	mode?: "create" | "edit" | "market";
	/** Optional initial draft used to hydrate the form when editing an existing server. */
	initialDraft?: ServerInstallDraft | null;
	/** Allow users to modify the JSON representation. Defaults to true in create mode. */
	allowJsonEditing?: boolean;
	/** Market mode specific props */
	onPreview?: () => void;
	onImport?: () => void;
}

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
			onImport,
		}: ServerInstallManualFormProps,
		ref,
	) => {
		const isEditMode = mode === "edit";
		const isMarketMode = mode === "market";
		const jsonEditingEnabled = allowJsonEditing ?? !isEditMode;
		const ingestEnabled = !isEditMode && !isMarketMode;

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
			},
		});

		const [activeTab, setActiveTab] = useState<"core" | "meta">("core");
		const [isIngesting, setIsIngesting] = useState(false);
		const [ingestMessage, setIngestMessage] = useState<string>(
			DEFAULT_INGEST_MESSAGE,
		);
		const [ingestError, setIngestError] = useState<string | null>(null);
		const [isIngestSuccess, setIsIngestSuccess] = useState(false);
		const [isDropZoneCollapsed, setIsDropZoneCollapsed] = useState(
			!ingestEnabled,
		);
		const [isDragOver, setIsDragOver] = useState(false);
		const [deleteConfirmStates, setDeleteConfirmStates] = useState<
			Record<string, boolean>
		>({});

		const buildFormValuesFromState = useCallback(
			(state: ManualFormStateJson): ManualServerFormValues => {
				const commonMeta = state.meta;
				const base: ManualServerFormValues = {
					name: state.name ?? "",
					kind: state.kind,
					command: "",
					url: "",
					args: [],
					env: [],
					headers: [],
					meta_description: commonMeta.description,
					meta_version: commonMeta.version,
					meta_website_url: commonMeta.websiteUrl,
					meta_repository_url: commonMeta.repository.url,
					meta_repository_source: commonMeta.repository.source,
					meta_repository_subfolder: commonMeta.repository.subfolder,
					meta_repository_id: commonMeta.repository.id,
				};

				if (state.kind === "stdio") {
					base.command = state.stdio.command ?? "";
					base.args = cloneArgs(state.stdio.args);
					base.env = cloneKeyValuePairs(state.stdio.env);
				} else if (state.kind === "sse") {
					base.url = state.sse.url ?? "";
					base.headers = cloneKeyValuePairs(state.sse.headers);
					(base as any).urlParams = cloneKeyValuePairs(state.sse.urlParams);
				} else {
					base.url = state.streamable_http.url ?? "";
					base.headers = cloneKeyValuePairs(state.streamable_http.headers);
					(base as any).urlParams = cloneKeyValuePairs(
						state.streamable_http.urlParams,
					);
				}

				return base;
			},
			[],
		);

		const createInitialFormState = useCallback(
			(): ManualFormStateJson => ({
				name: "",
				kind: "stdio",
				meta: {
					description: "",
					version: "",
					websiteUrl: "",
					repository: {
						url: "",
						source: "",
						subfolder: "",
						id: "",
					},
					icons: [],
				},
				stdio: { command: "", args: [], env: [] },
				sse: { url: "", headers: [] },
				streamable_http: { url: "", headers: [] },
			}),
			[],
		);

		const formStateRef = useRef<ManualFormStateJson>(createInitialFormState());
		const isRestoringRef = useRef(false);
		const lastInitialDraftRef = useRef<string | null>(null);

		const dropZoneRef = useRef<HTMLButtonElement | null>(null);

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

		// URL parameters for HTTP kinds
		const {
			fields: urlParamFields,
			append: appendUrlParam,
			remove: removeUrlParam,
		} = useFieldArray({ control, name: "urlParams" });

		const kind = watch("kind");
		const isStdio = kind === "stdio";

		const commandInputRef = useRef<HTMLInputElement | null>(null);
		const urlInputRef = useRef<HTMLInputElement | null>(null);
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

		useEffect(() => {
			if (isRestoringRef.current) return;
			formStateRef.current.name = watchedName ?? "";
		}, [watchedName]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			formStateRef.current.meta.description = watchedMetaDescription ?? "";
		}, [watchedMetaDescription]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			formStateRef.current.meta.version = watchedMetaVersion ?? "";
		}, [watchedMetaVersion]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			formStateRef.current.meta.websiteUrl = watchedMetaWebsite ?? "";
		}, [watchedMetaWebsite]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			const repository = formStateRef.current.meta.repository;
			repository.url = watchedMetaRepositoryUrl ?? "";
			repository.source = watchedMetaRepositorySource ?? "";
			repository.subfolder = watchedMetaRepositorySubfolder ?? "";
			repository.id = watchedMetaRepositoryId ?? "";
		}, [
			watchedMetaRepositoryUrl,
			watchedMetaRepositorySource,
			watchedMetaRepositorySubfolder,
			watchedMetaRepositoryId,
		]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			formStateRef.current.kind = kind;
		}, [kind]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			if (kind !== "stdio") return;
			formStateRef.current.stdio.command = watchedCommand ?? "";
		}, [kind, watchedCommand]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			if (kind !== "stdio") return;
			formStateRef.current.stdio.args = cloneArgs(watchedArgs);
		}, [kind, watchedArgs]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			if (kind !== "stdio") return;
			formStateRef.current.stdio.env = cloneKeyValuePairs(watchedEnv);
		}, [kind, watchedEnv]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			if (kind === "sse") {
				formStateRef.current.sse.url = watchedUrl ?? "";
				return;
			}
			if (kind === "streamable_http") {
				formStateRef.current.streamable_http.url = watchedUrl ?? "";
			}
		}, [kind, watchedUrl]);

		useEffect(() => {
			if (isRestoringRef.current) return;
			if (kind === "sse") {
				formStateRef.current.sse.headers = cloneKeyValuePairs(watchedHeaders);
				return;
			}
			if (kind === "streamable_http") {
				formStateRef.current.streamable_http.headers =
					cloneKeyValuePairs(watchedHeaders);
			}
		}, [kind, watchedHeaders]);

		const [viewMode, setViewMode] = useState<"form" | "json">("form");
		const [jsonText, setJsonText] = useState<string>(
			`{
	  "mcpServers": {
	    "example": {
	      "type": "stdio",
	      "command": "uvx",
	      "args": []
	    }
	  }
}`,
		);
		const [jsonError, setJsonError] = useState<string | null>(null);

		// Reset ingest state to default
		const resetIngestState = useCallback(() => {
			setIngestError(null);
			setIsIngestSuccess(false);
			setIsDropZoneCollapsed(!ingestEnabled);
			setIsDragOver(false);
			setIngestMessage(DEFAULT_INGEST_MESSAGE);
		}, [ingestEnabled]);

		// Reset the entire form & in-memory state for a fresh start
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
			setIsIngesting(false);
		}, [
			createInitialFormState,
			reset,
			buildFormValuesFromState,
			resetIngestState,
		]);

		// Handle delete confirmation
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

		// Handle ghost field click - always add new field
		const handleGhostClick = useCallback((addFn: () => void) => {
			addFn();
		}, []);

		// JSON state helpers
		const saveTypeSnapshot = useCallback(
			(currentKind: ManualServerFormValues["kind"]) => {
				const values = getValues();
				formStateRef.current.name = values.name ?? "";
				formStateRef.current.meta.description = values.meta_description ?? "";
				formStateRef.current.meta.version = values.meta_version ?? "";
				formStateRef.current.meta.websiteUrl = values.meta_website_url ?? "";
				formStateRef.current.meta.repository = {
					url: values.meta_repository_url ?? "",
					source: values.meta_repository_source ?? "",
					subfolder: values.meta_repository_subfolder ?? "",
					id: values.meta_repository_id ?? "",
				};

				if (currentKind === "stdio") {
					formStateRef.current.stdio = {
						command: values.command ?? "",
						args: cloneArgs(values.args),
						env: cloneKeyValuePairs(values.env),
					};
				} else if (currentKind === "sse") {
					formStateRef.current.sse = {
						url: values.url ?? "",
						headers: cloneKeyValuePairs(values.headers),
						urlParams: cloneKeyValuePairs(values.urlParams),
					};
				} else {
					formStateRef.current.streamable_http = {
						url: values.url ?? "",
						headers: cloneKeyValuePairs(values.headers),
						urlParams: cloneKeyValuePairs(values.urlParams),
					};
				}

				formStateRef.current.kind = currentKind;
			},
			[getValues],
		);

		const restoreTypeSnapshot = useCallback(
			(targetKind: ManualServerFormValues["kind"]) => {
				const state = formStateRef.current;
				state.kind = targetKind;
				isRestoringRef.current = true;
				reset(buildFormValuesFromState(state), {
					keepDirty: true,
					keepTouched: true,
					keepIsSubmitted: true,
					keepErrors: true,
					keepSubmitCount: true,
				});
				isRestoringRef.current = false;
			},
			[buildFormValuesFromState, reset],
		);

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
		}, [createInitialFormState, isOpen, reset, resetIngestState]);

		const buildDraftFromValues = (
			values: ManualServerFormValues,
		): ServerInstallDraft => {
			const trim = (value?: string | null) => {
				if (value == null) return undefined;
				const next = value.trim();
				return next.length > 0 ? next : undefined;
			};

			const args = (values.args ?? [])
				.map((item) => trim(item.value))
				.filter((value): value is string => Boolean(value));

			const envEntries = (values.env ?? [])
				.map((entry) => {
					const key = trim(entry.key);
					const value = trim(entry.value);
					return key ? { key, value: value ?? "" } : null;
				})
				.filter((entry): entry is { key: string; value: string } =>
					Boolean(entry),
				);

			const env = envEntries.length
				? envEntries.reduce<Record<string, string>>((acc, entry) => {
						acc[entry.key] = entry.value;
						return acc;
					}, {})
				: undefined;

			const headerEntries = (values.headers ?? [])
				.map((entry) => {
					const key = trim(entry.key);
					const value = trim(entry.value);
					return key ? { key, value: value ?? "" } : null;
				})
				.filter((entry): entry is { key: string; value: string } =>
					Boolean(entry),
				);

			const headers = headerEntries.length
				? headerEntries.reduce<Record<string, string>>((acc, entry) => {
						acc[entry.key] = entry.value;
						return acc;
					}, {})
				: undefined;

			// URL parameters (HTTP kinds only)
			const urlParamEntries = (values.urlParams ?? [])
				.map((entry) => {
					const key = trim(entry.key);
					const value = trim(entry.value);
					return key ? { key, value: value ?? "" } : null;
				})
				.filter((entry): entry is { key: string; value: string } =>
					Boolean(entry),
				);

			const urlParams = urlParamEntries.length
				? urlParamEntries.reduce<Record<string, string>>((acc, entry) => {
						acc[entry.key] = entry.value;
						return acc;
					}, {})
				: undefined;

			const repository: RegistryRepositoryInfo | undefined = (() => {
				const payload: RegistryRepositoryInfo = {};
				const url = trim(values.meta_repository_url);
				const source = trim(values.meta_repository_source);
				const subfolder = trim(values.meta_repository_subfolder);
				const id = trim(values.meta_repository_id);
				if (url) payload.url = url;
				if (source) payload.source = source;
				if (subfolder) payload.subfolder = subfolder;
				if (id) payload.id = id;
				return Object.keys(payload).length ? payload : undefined;
			})();

			const meta: ServerMetaInfo = {};
			const description = trim(values.meta_description);
			const version = trim(values.meta_version);
			const websiteUrl = trim(values.meta_website_url);
			if (description) meta.description = description;
			if (version) meta.version = version;
			if (websiteUrl) meta.websiteUrl = websiteUrl;
			if (repository) meta.repository = repository;
			// Include icons preserved in in-memory state (read-only on form)
			const icons = formStateRef.current.meta.icons;
			if (icons?.length) {
				meta.icons = icons.map((it) => ({
					src: it.src,
					mimeType: it.mimeType,
					sizes: it.sizes,
				}));
			}

			const envForDraft = values.kind === "stdio" ? env : headers;

			return {
				name: values.name.trim(),
				kind: values.kind,
				command: values.kind === "stdio" ? trim(values.command) : undefined,
				url: values.kind === "stdio" ? undefined : trim(values.url),
				args: values.kind === "stdio" && args.length ? args : undefined,
				env: envForDraft,
				headers: values.kind !== "stdio" ? headers : undefined,
				...(values.kind !== "stdio" && urlParams ? { urlParams } : {}),
				meta: Object.keys(meta).length ? meta : undefined,
			};
		};

		// ===== Ingest helpers (Uni-Import) =====
		const applySingleDraftToForm = useCallback(
			(draft: ServerInstallDraft) => {
				const nextState = createInitialFormState();
				nextState.name = draft.name ?? "";
				nextState.kind = draft.kind;
				nextState.meta = {
					description: draft.meta?.description ?? "",
					version: draft.meta?.version ?? "",
					websiteUrl: draft.meta?.websiteUrl ?? "",
					repository: {
						url: draft.meta?.repository?.url ?? "",
						source: draft.meta?.repository?.source ?? "",
						subfolder: draft.meta?.repository?.subfolder ?? "",
						id: draft.meta?.repository?.id ?? "",
					},
					icons: (draft.meta?.icons || [])
						.map((it) => ({
							src: String(
								(it as any).src ?? (it as any).url ?? (it as any).href ?? "",
							),
							mimeType:
								(it as any).mimeType ?? (it as any).mime_type ?? undefined,
							sizes: (it as any).sizes ?? (it as any).size ?? undefined,
						}))
						.filter((it) => it.src),
				};

				if (draft.kind === "stdio") {
					nextState.stdio = {
						command: draft.command ?? "",
						args: (draft.args || []).map((value) => ({ value })),
						env: Object.entries(draft.env || {}).map(([key, value]) => ({
							key,
							value,
						})),
					};
				} else if (draft.kind === "sse") {
					nextState.sse = {
						url: draft.url ?? "",
						headers: Object.entries(draft.headers || {}).map(
							([key, value]) => ({
								key,
								value,
							}),
						),
						urlParams: Object.entries((draft as any)?.urlParams || {}).map(
							([key, value]) => ({ key, value: String(value ?? "") }),
						),
					};
				} else {
					nextState.streamable_http = {
						url: draft.url ?? "",
						headers: Object.entries(draft.headers || {}).map(
							([key, value]) => ({
								key,
								value,
							}),
						),
						urlParams: Object.entries((draft as any)?.urlParams || {}).map(
							([key, value]) => ({ key, value: String(value ?? "") }),
						),
					};
				}

				formStateRef.current = nextState;
				isRestoringRef.current = true;
				reset(buildFormValuesFromState(nextState), {
					keepDirty: true,
					keepTouched: true,
					keepIsSubmitted: true,
					keepErrors: true,
					keepSubmitCount: true,
				});
				isRestoringRef.current = false;
			},
			[buildFormValuesFromState, createInitialFormState, reset],
		);

		const finalizeIngest = useCallback(
			async (drafts: ServerInstallDraft[]) => {
				if (!drafts.length) {
					setIngestError("No servers detected in the input");
					notifyError(
						"No servers detected",
						"We could not find any server definitions in the input.",
					);
					return;
				}
				if (drafts.length === 1) {
					applySingleDraftToForm(drafts[0]);
					setIsIngestSuccess(true);
					setIsDropZoneCollapsed(true);
					setIngestMessage("Server configuration loaded successfully");
					setIngestError(null);
					setActiveTab("core");
					return;
				}
				onSubmitMultiple?.(drafts);
				onClose();
			},
			[applySingleDraftToForm, onSubmitMultiple, onClose],
		);

		const handleIngestPayload = useCallback(
			async (payload: {
				text?: string;
				buffer?: ArrayBuffer;
				fileName?: string;
			}) => {
				if (!ingestEnabled) return;
				try {
					setIsIngesting(true);
					setIngestError(null);
					const drafts = await normalizeIngestResult(payload);
					await finalizeIngest(drafts);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Failed to parse input";
					setIngestError(message);
					notifyError("Parsing failed", message);
				} finally {
					setIsIngesting(false);
				}
			},
			[finalizeIngest, ingestEnabled],
		);

		useImperativeHandle(ref, () => ({
			ingest: ingestEnabled ? handleIngestPayload : async () => undefined,
			loadDraft: (draft: ServerInstallDraft) => {
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

		// Handle form interaction to collapse drop zone
		const handleFormInteraction = useCallback(() => {
			if (!isDropZoneCollapsed) {
				setIsDropZoneCollapsed(true);
			}
		}, [isDropZoneCollapsed]);

		// Handle drop zone click to expand
		const handleDropZoneClick = useCallback(() => {
			if (!ingestEnabled) return;
			if (isDropZoneCollapsed) {
				setIsDropZoneCollapsed(false);
				// Reset error and success states but keep drag over state
				setIngestError(null);
				setIsIngestSuccess(false);
				setIngestMessage(DEFAULT_INGEST_MESSAGE);
			}
		}, [ingestEnabled, isDropZoneCollapsed]);

		const onDragEnter = (event: React.DragEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			event.preventDefault();
			event.stopPropagation();
			setIsDragOver(true);
			// Expand drop zone if collapsed
			if (isDropZoneCollapsed) {
				setIsDropZoneCollapsed(false);
				setIngestError(null);
				setIsIngestSuccess(false);
				setIngestMessage(DEFAULT_INGEST_MESSAGE);
			}
		};

		const onDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
			if (!ingestEnabled) return;
			event.preventDefault();
			event.stopPropagation();
			// Only set isDragOver to false if we're leaving the entire drop zone
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
			// If drop zone is collapsed, ignore paste events to allow form fields to receive them
			if (isDropZoneCollapsed) return;
			if (isIngesting) return;
			const text = event.clipboardData.getData("text/plain");
			if (text) {
				event.preventDefault();
				setIngestMessage("Parsing pasted content");
				handleIngestPayload({ text });
			}
		};

		useEffect(() => {
			if (!isOpen || !ingestEnabled) return;
			const listener = (event: ClipboardEvent) => {
				// If drop zone is collapsed, ignore paste events to allow form fields to receive them
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
		]);

		useEffect(() => {
			if (!isOpen || !ingestEnabled) return;
			const frame = requestAnimationFrame(() => {
				dropZoneRef.current?.focus();
			});
			return () => cancelAnimationFrame(frame);
		}, [ingestEnabled, isOpen]);

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
			setIngestMessage(isEditMode ? "Editing server" : DEFAULT_INGEST_MESSAGE);
		}, [applySingleDraftToForm, initialDraft, isEditMode, isOpen]);

		// Inject breathing animation styles
		useEffect(() => {
			const style = document.createElement("style");
			style.textContent = breathingAnimation;
			document.head.appendChild(style);
			return () => {
				document.head.removeChild(style);
			};
		}, []);

		const submitForm = async (values: ManualServerFormValues) => {
			const draft = buildDraftFromValues(values);

			if (draft.kind === "stdio" && !draft.command) {
				notifyError("Command required", "Provide a command for stdio servers.");
				return;
			}
			if (draft.kind !== "stdio" && !draft.url) {
				notifyError(
					"Endpoint required",
					"Provide a URL for non-stdio servers.",
				);
				return;
			}

			await onSubmit(draft);
			onClose();
			reset();
		};

		const submitJson = async () => {
			try {
				const drafts = parseJsonDrafts(jsonText);
				if (!drafts.length) {
					setJsonError("No servers found in JSON payload");
					return;
				}
				if (drafts.length > 1) {
					setJsonError("Manual entry accepts exactly one server in JSON mode");
					return;
				}
				setJsonError(null);
				await onSubmit(drafts[0]);
				onClose();
				reset();
				setViewMode("form");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to parse JSON";
				setJsonError(message);
				notifyError("Invalid JSON", message);
			}
		};

		const syncFormToJson = () => {
			saveTypeSnapshot(kind);
			// Build from the in-memory snapshot to avoid RHF timing/staleness
			const valuesForJson = buildFormValuesFromState(formStateRef.current);
			const current = buildDraftFromValues(valuesForJson);

			const entry: Record<string, unknown> = {
				type: current.kind,
			};

			if (current.kind === "stdio") {
				if (current.command) entry.command = current.command;
				if (current.args && current.args.length) entry.args = current.args;
				if (current.env && Object.keys(current.env).length)
					entry.env = current.env;
			} else {
				// Compose full URL with query parameters for JSON view
				if (current.url) {
					const params = (current as any).urlParams as
						| Record<string, string>
						| undefined;
					if (params && Object.keys(params).length) {
						try {
							const isHttp = /^https?:/i.test(current.url);
							const u = new URL(
								current.url,
								isHttp ? undefined : "http://dummy.local",
							);
							// Preserve existing params if any, then set/override from urlParams
							for (const [k, v] of Object.entries(params)) {
								u.searchParams.set(k, v);
							}
							entry.url = isHttp
								? u.toString()
								: `${current.url}?${u.searchParams.toString()}`;
						} catch {
							const qs = new URLSearchParams(
								(current as any).urlParams as Record<string, string>,
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
				const draft = drafts[0];
				setJsonError(null);

				const prev = formStateRef.current;
				const nextState: ManualFormStateJson = {
					name: draft.name ?? prev.name,
					kind: draft.kind ?? prev.kind,
					meta: {
						description: draft.meta?.description ?? prev.meta.description ?? "",
						version: draft.meta?.version ?? prev.meta.version ?? "",
						websiteUrl: draft.meta?.websiteUrl ?? prev.meta.websiteUrl ?? "",
						repository: {
							url:
								draft.meta?.repository?.url ?? prev.meta.repository.url ?? "",
							source:
								draft.meta?.repository?.source ??
								prev.meta.repository.source ??
								"",
							subfolder:
								draft.meta?.repository?.subfolder ??
								prev.meta.repository.subfolder ??
								"",
							id: draft.meta?.repository?.id ?? prev.meta.repository.id ?? "",
						},
						icons: (draft.meta?.icons || prev.meta.icons || [])
							.map((it: any) => ({
								src: String(it?.src ?? it?.url ?? it?.href ?? ""),
								mimeType: it?.mimeType ?? it?.mime_type ?? undefined,
								sizes: it?.sizes ?? it?.size ?? undefined,
							}))
							.filter((it: IconState) => it.src),
					},
					stdio: { ...prev.stdio },
					sse: { ...prev.sse },
					streamable_http: { ...prev.streamable_http },
				};

				if (nextState.kind === "stdio") {
					const hasArgs = Array.isArray(draft.args);
					const hasEnv = draft.env && typeof draft.env === "object";
					nextState.stdio = {
						command:
							typeof draft.command === "string"
								? draft.command
								: prev.stdio.command,
						args: hasArgs
							? (draft.args as unknown[]).map((v) => ({
									value: String((v as unknown) ?? ""),
								}))
							: cloneArgs(prev.stdio.args),
						env: hasEnv
							? Object.entries(draft.env as Record<string, unknown>).map(
									([key, value]) => ({
										key,
										value: String(value ?? ""),
									}),
								)
							: cloneKeyValuePairs(prev.stdio.env),
					};
				} else if (nextState.kind === "sse") {
					const hasHeaders = draft.headers && typeof draft.headers === "object";
					nextState.sse = {
						url: typeof draft.url === "string" ? draft.url : prev.sse.url,
						headers: hasHeaders
							? Object.entries(draft.headers as Record<string, unknown>).map(
									([key, value]) => ({
										key,
										value: String(value ?? ""),
									}),
								)
							: cloneKeyValuePairs(prev.sse.headers),
						urlParams: (() => {
							const raw =
								(draft as any)?.urlParams || (draft as any)?.url_params || {};
							if (raw && typeof raw === "object") {
								return Object.entries(raw as Record<string, unknown>).map(
									([key, value]) => ({
										key,
										value: String(value ?? ""),
									}),
								);
							}
							return cloneKeyValuePairs(prev.sse.urlParams);
						})(),
					};
				} else {
					const hasHeaders = draft.headers && typeof draft.headers === "object";
					nextState.streamable_http = {
						url:
							typeof draft.url === "string"
								? draft.url
								: prev.streamable_http.url,
						headers: hasHeaders
							? Object.entries(draft.headers as Record<string, unknown>).map(
									([key, value]) => ({
										key,
										value: String(value ?? ""),
									}),
								)
							: cloneKeyValuePairs(prev.streamable_http.headers),
						urlParams: (() => {
							const raw =
								(draft as any)?.urlParams || (draft as any)?.url_params || {};
							if (raw && typeof raw === "object") {
								return Object.entries(raw as Record<string, unknown>).map(
									([key, value]) => ({
										key,
										value: String(value ?? ""),
									}),
								);
							}
							return cloneKeyValuePairs(prev.streamable_http.urlParams);
						})(),
					};
				}

				formStateRef.current = nextState;
				isRestoringRef.current = true;
				reset(buildFormValuesFromState(nextState), {
					keepDirty: true,
					keepTouched: true,
					keepIsSubmitted: true,
					keepErrors: true,
					keepSubmitCount: true,
				});
				isRestoringRef.current = false;
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

		const submitButtonLabel = isEditMode
			? "Save changes"
			: isMarketMode
				? "Import server"
				: "Preview";
		const pendingButtonLabel = isEditMode
			? "Saving..."
			: isMarketMode
				? "Importing..."
				: "Processing...";

		const commandField =
			viewMode === "form" ? (
				isStdio ? (
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
				)
			) : null;

		const stdioAdvancedSection =
			viewMode === "form" && isStdio ? (
				<div className="space-y-6">
					<FieldList
						label="Arguments"
						fields={argFields}
						onRemove={removeArg}
						deleteConfirmStates={deleteConfirmStates}
						onDeleteClick={handleDeleteClick}
						renderField={(field, index) => {
							if (field.id === "ghost") {
								return (
									<Input
										placeholder="Add a new argument"
										onClick={() =>
											handleGhostClick(() => appendArg({ value: "" }))
										}
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
						onDeleteClick={handleDeleteClick}
						renderField={(field, index) => {
							if (field.id === "ghost") {
								return (
									<div className="grid grid-cols-2 gap-2">
										<Input
											placeholder="Add a new key"
											onClick={() =>
												handleGhostClick(() =>
													appendEnv({ key: "", value: "" }),
												)
											}
											className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
											readOnly
										/>
										<Input
											placeholder="Add a new value"
											onClick={() =>
												handleGhostClick(() =>
													appendEnv({ key: "", value: "" }),
												)
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
			) : null;

		const headersSection =
			viewMode === "form" && !isStdio ? (
				<FieldList
					label="HTTP Headers"
					fields={headerFields}
					onRemove={removeHeader}
					deleteConfirmStates={deleteConfirmStates}
					onDeleteClick={handleDeleteClick}
					renderField={(field, index) => {
						if (field.id === "ghost") {
							return (
								<div className="grid grid-cols-2 gap-2">
									<Input
										placeholder="Add a new header"
										onClick={() =>
											handleGhostClick(() =>
												appendHeader({ key: "", value: "" }),
											)
										}
										className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
										readOnly
									/>
									<Input
										placeholder="Add a new value"
										onClick={() =>
											handleGhostClick(() =>
												appendHeader({ key: "", value: "" }),
											)
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
									{...register(`headers.${index}.key` as const)}
									placeholder="Header"
								/>
								<Input
									{...register(`headers.${index}.value` as const)}
									placeholder="Value"
								/>
							</div>
						);
					}}
				/>
			) : null;

		const urlParamsSection =
			viewMode === "form" && !isStdio ? (
				<FieldList
					label="URL Parameters"
					fields={urlParamFields}
					onRemove={removeUrlParam}
					deleteConfirmStates={deleteConfirmStates}
					onDeleteClick={handleDeleteClick}
					renderField={(field, index) => {
						if (field.id === "ghost") {
							return (
								<div className="grid grid-cols-2 gap-2">
									<Input
										placeholder="Parameter name"
										onClick={() =>
											handleGhostClick(() =>
												appendUrlParam({ key: "", value: "" }),
											)
										}
										className="border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
										readOnly
									/>
									<Input
										placeholder="Value"
										onClick={() =>
											handleGhostClick(() =>
												appendUrlParam({ key: "", value: "" }),
											)
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
			) : null;

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

						{/* Uni-Import Drop Zone - Fixed at top */}
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
								className={cn(
									"px-4 mb-4 w-full cursor-pointer focus:outline-none",
									isDropZoneCollapsed ? "h-10" : "h-[18vh]",
								)}
								style={{
									border: "none",
								}}
							>
								<div
									className={cn(
										"w-full h-full flex items-center justify-center gap-4 rounded-lg border border-dashed transition-all duration-300",
										isDropZoneCollapsed
											? "flex-row px-4 py-2 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
											: "flex-col py-8 border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
										ingestError
											? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
											: isIngestSuccess
												? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
												: isDragOver
													? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
													: "",
									)}
								>
									{isIngesting ? (
										<Loader2
											className={cn(
												"animate-spin",
												isDropZoneCollapsed ? "h-4 w-4" : "h-6 w-6",
											)}
										/>
									) : (
										<Target
											className={cn(
												"transition-all duration-300",
												isDropZoneCollapsed ? "h-4 w-4" : "h-12 w-12",
												isDragOver || isIngesting
													? "animate-pulse"
													: "scale-100",
												isDragOver ? "text-blue-500" : "text-slate-500",
											)}
											style={{
												animation:
													ingestError || isDragOver || isIngesting
														? "breathing 1.5s ease-in-out infinite"
														: undefined,
											}}
										/>
									)}

									<div
										className={cn(
											"text-center",
											isDropZoneCollapsed ? "flex-1 text-left" : "",
										)}
									>
										<p
											className={cn(
												"leading-relaxed transition-all duration-300",
												isDropZoneCollapsed
													? "text-sm max-w-none"
													: "max-w-none px-4 text-sm",
												ingestError
													? "text-red-600 dark:text-red-400"
													: isIngestSuccess
														? "text-green-600 dark:text-green-400"
														: isDragOver
															? "text-blue-600 dark:text-blue-400"
															: "text-slate-600 dark:text-slate-300",
												isIngesting || isDragOver ? "animate-pulse" : "",
											)}
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
							className={cn(
								"flex-1 overflow-y-auto px-4 pb-4",
								ingestEnabled ? "pt-0" : "pt-4",
							)}
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
									className={cn(
										"space-y-6",
										viewMode === "json" ? "flex flex-col h-full" : "",
									)}
									onClick={handleFormInteraction}
								>
									<div className="flex items-center justify-end">
										<div className="flex rounded-lg border border-slate-200 p-1 text-xs dark:border-slate-700">
											<button
												type="button"
												onClick={() => handleModeChange("form")}
												className={cn(
													"rounded-l-md rounded-r-none px-3 py-1 font-medium transition-colors",
													viewMode === "form"
														? "bg-primary text-primary-foreground"
														: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
												)}
											>
												Form
											</button>
											<button
												type="button"
												onClick={() => handleModeChange("json")}
												className={cn(
													"rounded-r-md rounded-l-none px-3 py-1 font-medium transition-colors",
													viewMode === "json"
														? "bg-primary text-primary-foreground"
														: "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
												)}
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
															className={cn(
																isEditMode
																	? "cursor-not-allowed bg-muted text-muted-foreground"
																	: undefined,
															)}
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

											{commandField}

											{stdioAdvancedSection}

											{urlParamsSection}
											{headersSection}
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
									{/* Icon preview (read-only) */}
									{(() => {
										const icon = formStateRef.current.meta.icons?.[0];
										const fallback = (formStateRef.current.name || "S")
											.slice(0, 1)
											.toUpperCase();
										return (
											<div className="flex items-center gap-4">
												<div className="w-20" />
												<div className="flex items-center gap-3">
													<Avatar className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
														{icon?.src ? (
															<AvatarImage src={icon.src} alt="Server icon" />
														) : null}
														<AvatarFallback>{fallback}</AvatarFallback>
													</Avatar>
												</div>
											</div>
										);
									})()}

									<div className="flex items-center gap-4">
										<Label htmlFor={metaVersionId} className="w-20 text-right">
											Version
										</Label>
										<div className="flex-1">
											<Input
												id={metaVersionId}
												{...register("meta_version")}
												placeholder="e.g., 1.0.0"
											/>
										</div>
									</div>

									<div className="flex items-center gap-4">
										<Label
											htmlFor={metaWebsiteUrlId}
											className="w-20 text-right"
										>
											Website
										</Label>
										<div className="flex-1">
											<Input
												id={metaWebsiteUrlId}
												{...register("meta_website_url")}
												placeholder="https://example.com"
											/>
											{errors.meta_website_url && (
												<p className="text-xs text-red-500">
													{errors.meta_website_url.message}
												</p>
											)}
										</div>
									</div>

									<div className="flex items-center gap-4">
										<Label
											htmlFor={metaRepositoryUrlId}
											className="w-20 text-right"
										>
											Repository URL
										</Label>
										<div className="flex-1">
											<Input
												id={metaRepositoryUrlId}
												{...register("meta_repository_url")}
												placeholder="https://github.com/org/repo"
											/>
											{errors.meta_repository_url && (
												<p className="text-xs text-red-500">
													{errors.meta_repository_url.message}
												</p>
											)}
										</div>
									</div>

									<div className="flex items-center gap-4">
										<Label
											htmlFor={metaRepositorySourceId}
											className="w-20 text-right"
										>
											Repository Source
										</Label>
										<div className="flex-1">
											<Input
												id={metaRepositorySourceId}
												{...register("meta_repository_source")}
												placeholder="e.g., github"
											/>
										</div>
									</div>

									<div className="flex items-center gap-4">
										<Label
											htmlFor={metaRepositorySubfolderId}
											className="w-20 text-right"
										>
											Repository Subfolder
										</Label>
										<div className="flex-1">
											<Input
												id={metaRepositorySubfolderId}
												{...register("meta_repository_subfolder")}
												placeholder="Optional subfolder"
											/>
										</div>
									</div>

									<div className="flex items-center gap-4">
										<Label
											htmlFor={metaRepositoryId}
											className="w-20 text-right"
										>
											Repository Entry ID
										</Label>
										<div className="flex-1">
											<Input
												id={metaRepositoryId}
												{...register("meta_repository_id")}
												placeholder="Optional identifier"
											/>
										</div>
									</div>
									{/* Description moved to bottom */}
									<div className="flex items-start gap-4">
										<Label
											htmlFor={metaDescriptionId}
											className="w-20 text-right pt-3"
										>
											Description
										</Label>
										<div className="flex-1">
											<Textarea
												id={metaDescriptionId}
												{...register("meta_description")}
												placeholder="Short description"
												rows={3}
											/>
										</div>
									</div>
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
