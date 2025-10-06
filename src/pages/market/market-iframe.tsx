import { useEffect, useRef } from "react";
import type { MarketIframeProps } from "./types";

export function MarketIframe({ url, title, className }: MarketIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	useEffect(() => {
		const timer = window.setInterval(() => {
			try {
				const el =
					iframeRef.current ||
					(document.querySelector(
						'iframe[src^="/market-proxy/"]',
					) as HTMLIFrameElement | null);
				const win = el?.contentWindow as Window | null;
				const doc = win?.document as Document | undefined;
				if (!doc) return;
				const id = "mcpmate-market-outline-style";
				if (!doc.getElementById(id)) {
					const s = doc.createElement("style");
					s.id = id;
					s.textContent = `
.mcpmate-code-outline {
  position: relative;
}

.mcpmate-code-outline code {
  background: transparent;
}

.mcpmate-config-button {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 0.2rem 0.6rem;
  min-height: 1.75rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(241, 245, 249, 0.82);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.mcpmate-config-button:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.45);
  outline-offset: 2px;
}

.mcpmate-config-icon {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: url("https://mcpmate.io/logo.svg") center / cover no-repeat;
  flex-shrink: 0;
  filter: invert(0);
}

.mcpmate-config-label {
  display: inline-flex;
  color: inherit;
  max-width: 0;
  opacity: 0;
  transform: translateX(-6px);
  overflow: hidden;
  transition: max-width 0.24s ease, opacity 0.18s ease, transform 0.18s ease, margin-left 0.18s ease;
  margin-left: 0;
}

.mcpmate-code-outline:hover {
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.45);
  background: var(--mcpmate-card-bg, rgba(248, 250, 252, 0.96)) !important;
}

.mcpmate-code-outline:hover .mcpmate-config-icon {
  opacity: 0.9;
}

.mcpmate-code-outline:hover .mcpmate-config-label,
.mcpmate-config-button:focus .mcpmate-config-label {
  max-width: 200px;
  opacity: 1;
  transform: translateX(0);
  margin-left: 0.35rem;
}

.mcpmate-config-button:hover {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(241, 245, 249, 0.92);
}

@media (prefers-color-scheme: dark) {
  .mcpmate-code-outline:hover {
    background: rgba(30, 41, 59, 0.72) !important;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.38), 0 0 0 1px rgba(148, 163, 184, 0.32);
  }

  .mcpmate-config-button {
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(30, 41, 59, 0.56);
  }

  .mcpmate-code-outline:hover .mcpmate-config-button,
  .mcpmate-config-button:focus {
    background: rgba(30, 41, 59, 0.75);
    border-color: rgba(148, 163, 184, 0.55);
  }

  .mcpmate-config-label {
    color: #f8fafc;
  }

  .mcpmate-config-icon {
    filter: invert(1);
  }
}
`;
					doc.head.appendChild(s);
				}
			} catch (_error) {
				/* noop */
			}
		}, 1200);
		return () => window.clearInterval(timer);
	}, []);

	return (
		<div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
			<iframe
				ref={iframeRef}
				src={url}
				className={`w-full h-[calc(100vh-300px)] min-h-[600px] rounded-xl ${className || ""}`}
				title={title}
				sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
			/>
		</div>
	);
}
