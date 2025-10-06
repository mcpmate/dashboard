import { useCallback, useEffect, useMemo, useState } from "react";
import {
	DEFAULT_MARKET_PORTALS,
	type MarketPortalMeta,
	useAppStore,
} from "../../../lib/store";
import type { TabItem, UseMarketTabsReturn } from "../types";

export function useMarketTabs(): UseMarketTabsReturn {
	// Get default market setting
	const defaultMarket = useAppStore(
		(state) => state.dashboardSettings.defaultMarket,
	);
	const marketPortals = useAppStore(
		(state) => state.dashboardSettings.marketPortals,
	);

	const mcpMarketMeta = useMemo<MarketPortalMeta>(() => {
		const stored = marketPortals?.mcpmarket;
		if (stored) return stored;
		return DEFAULT_MARKET_PORTALS.mcpmarket;
	}, [marketPortals]);

	const mcpMarketIcon = mcpMarketMeta.proxyFavicon ?? mcpMarketMeta.favicon;
	const mcpMarketProxyPath = mcpMarketMeta.proxyPath || "/market-proxy/";

	// Tab management state - initialize based on default market setting
	const [tabs, setTabs] = useState<TabItem[]>(() => {
		const officialTab = {
			id: "official",
			label: "Official MCP Registry",
			type: "official" as const,
			closable: defaultMarket !== "official",
		};
		const mcpMarketTab = {
			id: mcpMarketMeta.id,
			label: mcpMarketMeta.label,
			type: "third-party" as const,
			url: mcpMarketProxyPath,
			icon: mcpMarketIcon,
			closable: defaultMarket !== "mcpmarket",
		};

		if (defaultMarket === "official") {
			return [officialTab];
		} else {
			return [mcpMarketTab];
		}
	});

	const [activeTab, setActiveTab] = useState<string>(defaultMarket);

	useEffect(() => {
		const closable = defaultMarket !== "mcpmarket";
		setTabs((prev) =>
			prev.map((tab) => {
				const isMcpTab =
					tab.type === "third-party" &&
					(tab.id === DEFAULT_MARKET_PORTALS.mcpmarket.id ||
						tab.id === mcpMarketMeta.id);
				if (!isMcpTab) return tab;
				const nextIcon = mcpMarketIcon ?? tab.icon;
				const nextUrl = mcpMarketProxyPath;
				if (
					tab.id === mcpMarketMeta.id &&
					tab.label === mcpMarketMeta.label &&
					tab.url === nextUrl &&
					tab.icon === nextIcon &&
					tab.closable === closable
				) {
					return tab;
				}
				return {
					...tab,
					id: mcpMarketMeta.id,
					label: mcpMarketMeta.label,
					url: nextUrl,
					icon: nextIcon,
					closable,
				};
			}),
		);
	}, [
		defaultMarket,
		mcpMarketIcon,
		mcpMarketMeta.id,
		mcpMarketMeta.label,
		mcpMarketProxyPath,
	]);

	useEffect(() => {
		if (
			activeTab === DEFAULT_MARKET_PORTALS.mcpmarket.id &&
			mcpMarketMeta.id !== DEFAULT_MARKET_PORTALS.mcpmarket.id
		) {
			setActiveTab(mcpMarketMeta.id);
		}
	}, [activeTab, mcpMarketMeta.id]);

	const addTab = useCallback(
		(
			label: string,
			options?: {
				url?: string;
				icon?: string;
				id?: string;
			},
		) => {
			// Handle adding official registry when default is mcpmarket
			if (label === "Official MCP Registry") {
				const officialTab: TabItem = {
					id: "official",
					label: "Official MCP Registry",
					type: "official",
					closable: defaultMarket !== "official", // Only closable if not default
				};
				setTabs((prev) => [...prev, officialTab]);
				setActiveTab("official");
				return;
			}

			// Handle adding third-party markets
			const targetId = options?.id ?? `tab-${Date.now()}`;
			setTabs((prev) => {
				if (options?.id && prev.some((tab) => tab.id === options.id)) {
					return prev;
				}
				const newTab: TabItem = {
					id: targetId,
					label,
					type: "third-party",
					url: options?.url,
					icon: options?.icon,
					closable: true, // Third-party markets are always closable
				};
				return [...prev, newTab];
			});
			setActiveTab(targetId);
		},
		[defaultMarket],
	);

	const closeTab = useCallback(
		(tabId: string) => {
			// Cannot close the default market tab
			if (tabId === defaultMarket) return;
			setTabs((prev) => {
				const newTabs = prev.filter((tab) => tab.id !== tabId);
				// If closing active tab, switch to default market tab
				if (activeTab === tabId) {
					setActiveTab(defaultMarket);
				}
				return newTabs;
			});
		},
		[activeTab, defaultMarket],
	);

	return {
		tabs,
		activeTab,
		setActiveTab,
		addTab,
		closeTab,
	};
}
