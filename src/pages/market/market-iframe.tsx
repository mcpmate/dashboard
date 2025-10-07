import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../../components/ui/spinner";
import { cn } from "../../lib/utils";
import type { MarketIframeProps } from "./types";

export function MarketIframe({
	url,
	title,
	portalId,
	proxyPath,
	className,
	refreshKey = 0,
}: MarketIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const readySignalRef = useRef(false);
	const loadTimeoutRef = useRef<number | null>(null);

	const effectiveUrl = useMemo(() => {
		try {
			// Preserve non-http(s) absolute URLs (e.g., mcpmate://) to keep custom scheme
			const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
			if (ABSOLUTE_SCHEME.test(url)) {
				const u = new URL(url);
				if (refreshKey > 0) {
					u.searchParams.set("_mcpmate_refresh", String(refreshKey));
				} else {
					u.searchParams.delete("_mcpmate_refresh");
				}
				return u.toString();
			}
			// Relative URL: keep same-origin path to avoid cross-origin in dev
			const target = new URL(url, window.location.origin);
			if (refreshKey > 0) {
				target.searchParams.set("_mcpmate_refresh", String(refreshKey));
			} else {
				target.searchParams.delete("_mcpmate_refresh");
			}
			return `${target.pathname}${target.search}${target.hash}`;
		} catch {
			if (refreshKey > 0) {
				const separator = url.includes("?") ? "&" : "?";
				return `${url}${separator}_mcpmate_refresh=${refreshKey}`;
			}
			return url;
		}
	}, [url, refreshKey]);

	useEffect(() => {
		setIsLoading(true);
		readySignalRef.current = false;
		if (loadTimeoutRef.current !== null) {
			window.clearTimeout(loadTimeoutRef.current);
		}
		loadTimeoutRef.current = window.setTimeout(() => {
			setIsLoading(false);
			loadTimeoutRef.current = null;
		}, 1500);
	}, [effectiveUrl]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (!event || typeof event.data !== "object") return;
			const data = event.data as {
				type?: string;
				payload?: { portalId?: string };
			};
			if (data.type !== "mcpmate-market-ready") return;
			if (data.payload?.portalId !== portalId) return;
			readySignalRef.current = true;
			if (loadTimeoutRef.current !== null) {
				window.clearTimeout(loadTimeoutRef.current);
				loadTimeoutRef.current = null;
			}
			setIsLoading(false);
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [portalId]);

	useEffect(() => {
		const selector = `iframe[src^="${proxyPath}"]`;
		const timer = window.setInterval(() => {
			try {
				const el =
					iframeRef.current ||
					(document.querySelector(selector) as HTMLIFrameElement | null);
				if (el) {
					el.dataset.portalId = portalId;
				}
			} catch {
				/* noop */
			}
		}, 2000);
		return () => window.clearInterval(timer);
	}, [portalId, proxyPath]);

	return (
		<div className="relative rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
			{isLoading ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm dark:bg-slate-950/70">
					<Spinner size="lg" />
				</div>
			) : null}
			<iframe
				ref={iframeRef}
				src={effectiveUrl}
				className={`w-full h-[calc(100vh-300px)] min-h-[600px] rounded-xl ${className || ""}`}
				title={title}
				sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
				onLoad={() => {
					if (loadTimeoutRef.current !== null) {
						window.clearTimeout(loadTimeoutRef.current);
						loadTimeoutRef.current = null;
					}
					setIsLoading(false);
				}}
			/>
		</div>
	);
}
