import React from "react";
import { Outlet } from "react-router-dom";
import { useAppStore } from "../../lib/store";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function Layout() {
	const { sidebarOpen, theme, setSidebarOpen } = useAppStore();

	// Apply theme and react to changes (system/manual)
	React.useEffect(() => {
		const apply = () => {
			const isDark =
				theme === "dark" ||
				(theme === "system" &&
					window.matchMedia("(prefers-color-scheme: dark)").matches);
			document.documentElement.classList.toggle("dark", isDark);
		};

		apply();

		let mediaQuery: MediaQueryList | null = null;
		const onChange = (e: MediaQueryListEvent) => {
			if (theme === "system") {
				document.documentElement.classList.toggle("dark", e.matches);
			}
		};
		if (theme === "system") {
			mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			mediaQuery.addEventListener("change", onChange);
		}

		return () => {
			if (mediaQuery) mediaQuery.removeEventListener("change", onChange);
		};
	}, [theme]);

	// Responsive sidebar: auto-collapse on small screens; if it was auto-collapsed,
	// re-open when returning to large screens. Manual toggles remain respected.
	React.useEffect(() => {
		const autoKey = "mcp_sidebar_auto";
		const handler = () => {
			try {
				const w = window.innerWidth;
				if (w < 1200) {
					if (sidebarOpen) setSidebarOpen(false);
					try {
						localStorage.setItem(autoKey, "1");
					} catch {
						/* noop */
					}
					return;
				}
				// Large screens: only auto-open if last close was auto
				let wasAuto = false;
				try {
					wasAuto = localStorage.getItem(autoKey) === "1";
				} catch {
					/* noop */
				}
				if (w >= 1200 && wasAuto && !sidebarOpen) {
					setSidebarOpen(true);
					try {
						localStorage.removeItem(autoKey);
					} catch {
						/* noop */
					}
				}
			} catch {
				/* noop */
			}
		};
		handler();
		window.addEventListener("resize", handler);
		return () => window.removeEventListener("resize", handler);
	}, [sidebarOpen, setSidebarOpen]);

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-900">
			<Sidebar />
			<Header />
			<main
				className={`pt-16 transition-all duration-300 ease-in-out ${
					sidebarOpen ? "ml-64" : "ml-16"
				}`}
			>
				{/* Make main area a flex column that occupies viewport height minus header, so footer can stick to bottom when content is short */}
				<div className="container mx-auto p-4 min-h-[calc(100vh-4rem)] flex flex-col">
					<div className="flex-1">
						<Outlet />
					</div>
					<footer className="mt-6 text-[11px] text-slate-500 border-t pt-2 pb-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
						<div>
							MCPMate Board <span className="font-mono">v0.1.0</span> •{" "}
							<a
								className="hover:underline"
								href="https://mcpmate.io"
								target="_blank"
								rel="noreferrer"
							>
								© 2025 MCPMate
							</a>
						</div>
						<div className="flex items-center gap-3">
							<a
								className="hover:underline"
								href="https://www.modelcontextprotocol.io"
								target="_blank"
								rel="noreferrer"
							>
								Model Context Protocol
							</a>
						</div>
					</footer>
				</div>
			</main>
		</div>
	);
}
