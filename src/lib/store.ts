import { create } from "zustand";
import type { Theme } from "./types";

interface AppState {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	sidebarOpen: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
	inspectorViewMode: "browse" | "debug";
	setInspectorViewMode: (mode: "browse" | "debug") => void;
}

function getInitialTheme(): Theme {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem("mcp_theme") : null;
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch { /* noop */ }
  return "system";
}

function getInitialInspectorMode(): "browse" | "debug" {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem("mcp_inspector_view") : null;
    if (saved === "debug") return "debug";
  } catch { /* noop */ }
  return "browse";
}

export const useAppStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    try {
      if (typeof window !== "undefined") localStorage.setItem("mcp_theme", theme);
    } catch { /* noop */ }
    set({ theme });
  },
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  inspectorViewMode: getInitialInspectorMode(),
  setInspectorViewMode: (mode) => {
    try {
      if (typeof window !== "undefined") localStorage.setItem("mcp_inspector_view", mode);
    } catch { /* noop */ }
    set({ inspectorViewMode: mode });
  },
}));
