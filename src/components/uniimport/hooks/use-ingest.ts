import { useCallback, useState } from "react";
import type { ServerInstallDraft } from "../../../hooks/use-server-install-pipeline";
import { normalizeIngestResult } from "../../../lib/install-normalizer";
import { notifyError } from "../../../lib/notify";
import type { ManualFormStateJson } from "../types";
import { DEFAULT_INGEST_MESSAGE } from "../types";

interface UseIngestProps {
	ingestEnabled: boolean;
	allowProgrammaticIngest: boolean;
	formStateRef: React.MutableRefObject<ManualFormStateJson>;
	buildFormValuesFromState: (state: ManualFormStateJson) => any;
	reset: (values?: any, options?: any) => void;
	onSubmitMultiple?: (drafts: ServerInstallDraft[]) => Promise<void> | void;
	onClose: () => void;
}

export function useIngest({
	ingestEnabled,
	allowProgrammaticIngest,
	formStateRef,
	buildFormValuesFromState,
	reset,
	onSubmitMultiple,
	onClose,
}: UseIngestProps) {
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

	const canIngestProgrammatically = ingestEnabled || allowProgrammaticIngest;

	// Reset ingest state to default
	const resetIngestState = useCallback(() => {
		setIngestError(null);
		setIsIngestSuccess(false);
		setIsDropZoneCollapsed(!ingestEnabled);
		setIsDragOver(false);
		setIngestMessage(DEFAULT_INGEST_MESSAGE);
	}, [ingestEnabled]);

	const applySingleDraftToForm = useCallback(
		(draft: ServerInstallDraft) => {
			const nextState: ManualFormStateJson = {
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
			};

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
					headers: Object.entries(draft.headers || {}).map(([key, value]) => ({
						key,
						value,
					})),
					urlParams: Object.entries((draft as any)?.urlParams || {}).map(
						([key, value]) => ({ key, value: String(value ?? "") }),
					),
				};
			} else {
				nextState.streamable_http = {
					url: draft.url ?? "",
					headers: Object.entries(draft.headers || {}).map(([key, value]) => ({
						key,
						value,
					})),
					urlParams: Object.entries((draft as any)?.urlParams || {}).map(
						([key, value]) => ({ key, value: String(value ?? "") }),
					),
				};
			}

			formStateRef.current = nextState;
			reset(buildFormValuesFromState(nextState), {
				keepDirty: true,
				keepTouched: true,
				keepIsSubmitted: true,
				keepErrors: true,
				keepSubmitCount: true,
			});
		},
		[buildFormValuesFromState, reset],
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
			if (!canIngestProgrammatically) return;
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
		[canIngestProgrammatically, finalizeIngest],
	);

	return {
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
	};
}
