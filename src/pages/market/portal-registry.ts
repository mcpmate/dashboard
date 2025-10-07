export interface MarketPortalDefinition {
  id: string;
  label: string;
  remoteOrigin: string;
  proxyPath: string;
  adapter: string;
  favicon?: string;
  proxyFavicon?: string;
  locales?: string[];
}

const ensureTrailingSlash = (value: string) =>
  value.endsWith("/") ? value : `${value}/`;

// Detect desktop shell (Tauri/App/File protocols) at runtime.
const isDesktopShell = () => {
  if (typeof window === "undefined") return false;
  const proto = String(window.location?.protocol || "").toLowerCase();
  return proto === "tauri:" || proto === "app:" || proto === "file:";
};

const resolveMarketProxyBase = () => {
  // In Node (vite config import) or browser: default to dev proxy base
  if (typeof window === "undefined") return "/market-proxy";
  // Prefer streaming proxy base injected by desktop shell
  const injected = (window as any).__MCPMATE_STREAM_PROXY_BASE__ as string | undefined;
  if (typeof injected === "string" && injected.trim().length > 0) {
    return injected.replace(/\/$/, "");
  }
  return isDesktopShell() ? "mcpmate://localhost/market-proxy" : "/market-proxy";
};

const MARKET_PROXY_BASE = resolveMarketProxyBase();

export const BUILTIN_MARKET_PORTALS: MarketPortalDefinition[] = [
  {
    id: "mcpmarket",
    label: "MCP Market",
    remoteOrigin: "https://mcpmarket.cn",
    proxyPath: ensureTrailingSlash(`${MARKET_PROXY_BASE}/mcpmarket`),
    adapter: "mcpmarket",
    favicon: "https://mcpmarket.cn/static/img/favicon.ico",
    proxyFavicon: `${MARKET_PROXY_BASE}/mcpmarket/static/img/favicon.ico`,
  },
];

export const MARKET_PORTAL_MAP: Record<string, MarketPortalDefinition> =
  BUILTIN_MARKET_PORTALS.reduce<Record<string, MarketPortalDefinition>>(
    (acc, portal) => {
      acc[portal.id] = {
        ...portal,
        proxyPath: ensureTrailingSlash(portal.proxyPath),
      };
      return acc;
    },
    {},
  );

export const createRegistryPortalMap =
  (): Record<string, MarketPortalDefinition> =>
    Object.fromEntries(
      Object.entries(MARKET_PORTAL_MAP).map(([id, portal]) => [
        id,
        { ...portal },
      ]),
    );

export const mergePortalOverrides = (
  overrides?: Record<string, Partial<MarketPortalDefinition> | undefined>,
): Record<string, MarketPortalDefinition> => {
  const base = createRegistryPortalMap();
  if (!overrides) {
    return base;
  }

  for (const [id, override] of Object.entries(overrides)) {
    if (!override) continue;
    const canonical = base[id];
    if (!canonical) continue;

    const merged: MarketPortalDefinition = { ...canonical };
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined || value === null) continue;
      (merged as Record<string, unknown>)[key] = value;
    }
    merged.id = id;
    merged.proxyPath = ensureTrailingSlash(merged.proxyPath);
    base[id] = merged;
  }

  return base;
};

export type MarketPortalId = keyof typeof MARKET_PORTAL_MAP;
