import React from "react";
import { Outlet } from "react-router-dom";
import { useAppStore } from "../../lib/store";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function Layout() {
  const { sidebarOpen, theme } = useAppStore();

  // Apply theme and react to changes (system/manual)
  React.useEffect(() => {
    const apply = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
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

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-900">
			<Sidebar />
			<Header />
			<main
				className={`pt-16 pb-8 transition-all duration-300 ease-in-out ${
					sidebarOpen ? "ml-64" : "ml-16"
				}`}
			>
				<div className="container mx-auto p-4">
					<Outlet />
				</div>
			</main>
		</div>
	);
}
