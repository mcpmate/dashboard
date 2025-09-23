import { create } from "zustand";
import type { Theme } from "./types";

interface AppState {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	sidebarOpen: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
}

function getInitialTheme(): Theme {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem("mcp_theme") : null;
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {}
  return "system";
}

export const useAppStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    try {
      if (typeof window !== "undefined") localStorage.setItem("mcp_theme", theme);
    } catch {}
    set({ theme });
  },
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
