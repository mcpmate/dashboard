import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type NotifyLevel = "info" | "success" | "warning" | "error";

export interface NotificationItem {
  id: string;
  level: NotifyLevel;
  title: string;
  description?: string;
  createdAt: number;
  read: boolean;
  href?: string;
}

interface NotifyState {
  items: NotificationItem[];
  unread: number;
  push: (n: Omit<NotificationItem, "id" | "createdAt" | "read"> & { id?: string }) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 0;
function genId() {
  seq = (seq + 1) % Number.MAX_SAFE_INTEGER;
  return `n_${Date.now()}_${seq}`;
}

export const useNotify = create<NotifyState>()(
  persist(
    (set, get) => ({
  items: [],
  unread: 0,
  push: ({ id, level, title, description, href }) => {
    const item: NotificationItem = {
      id: id || genId(),
      level,
      title,
      description,
      href,
      createdAt: Date.now(),
      read: false,
    };
    set((s) => {
      const items = [item, ...s.items].slice(0, 200);
      const unread = items.filter((it) => !it.read).length;
      return { items, unread };
    });
    return item.id;
  },
  markRead: (id) =>
    set((s) => {
      const items = s.items.map((it) => (it.id === id ? { ...it, read: true } : it));
      return { items, unread: items.filter((it) => !it.read).length };
    }),
  markAllRead: () =>
    set((s) => {
      const items = s.items.map((it) => ({ ...it, read: true }));
      return { items, unread: 0 };
    }),
  remove: (id) =>
    set((s) => {
      const items = s.items.filter((it) => it.id !== id);
      return { items, unread: items.filter((it) => !it.read).length };
    }),
  clear: () => set({ items: [], unread: 0 }),
    }),
    {
      name: "mcp_notifications",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.items)) {
          // Recompute unread based on hydrated items
          const unread = state.items.filter((it) => !it.read).length;
          set((s) => ({ ...s, unread }));
        }
      },
    }
  )
);

export function notifySuccess(title: string, description?: string, href?: string) {
  return useNotify.getState().push({ level: "success", title, description, href });
}
export function notifyInfo(title: string, description?: string, href?: string) {
  return useNotify.getState().push({ level: "info", title, description, href });
}
export function notifyWarning(title: string, description?: string, href?: string) {
  return useNotify.getState().push({ level: "warning", title, description, href });
}
export function notifyError(title: string, description?: string, href?: string) {
  return useNotify.getState().push({ level: "error", title, description, href });
}

export function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message || e.toString();
  try { return JSON.stringify(e); } catch { return String(e); }
}

export function notifyException(title: string, e: unknown) {
  return notifyError(title, stringifyError(e));
}
