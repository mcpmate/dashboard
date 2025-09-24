import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/layout";
import { ConfigPage } from "./pages/config/config-page";
import { ConfigPresetPage } from "./pages/config/config-preset-page";
import { ConfigSuitDetailPage } from "./pages/config/config-suit-detail-page";
import { DashboardPage } from "./pages/dashboard/dashboard-page";

import { NotFoundPage } from "./pages/not-found-page";
import { RuntimePage } from "./pages/runtime/runtime-page";
import { InstanceDetailPage } from "./pages/servers/instance-detail-page";
import { ServerDetailPage } from "./pages/servers/server-detail-page";
import { ServerListPage } from "./pages/servers/server-list-page";
import { SettingsPage } from "./pages/settings/settings-page";
// Tools page removed
// import { ToolsPage } from "./pages/tools/tools-page";
import { ClientsPage } from "./pages/clients/clients-page";
import { ClientDetailPage } from "./pages/clients/client-detail-page";

// Initialize the query client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 1000, // 30 seconds
			retry: 1,
			refetchOnWindowFocus: true,
		},
	},
});

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Layout />}>
						<Route index element={<DashboardPage />} />
                    {/* New canonical routes */}
                    <Route path="profiles" element={<ConfigPage />} />
						<Route
							path="config/presets/:presetId"
							element={<ConfigPresetPage />}
						/>
                    {/* Back-compat: redirect old routes */}
                    <Route path="config" element={<Navigate to="/profiles" replace />} />
                    <Route path="config/suits/:suitId" element={<Navigate to="/profiles/:suitId" replace />} />
                    <Route path="config/profiles/:suitId" element={<Navigate to="/profiles/:suitId" replace />} />
                    <Route path="profiles/:suitId" element={<ConfigSuitDetailPage />} />
						<Route path="servers" element={<ServerListPage />} />
						<Route path="servers/:serverId" element={<ServerDetailPage />} />
						<Route
							path="servers/:serverId/instances/:instanceId"
							element={<InstanceDetailPage />}
						/>
                    {/* Tools route removed */}
                    <Route path="clients" element={<ClientsPage />} />
                    <Route path="clients/:identifier" element={<ClientDetailPage />} />
						<Route path="runtime" element={<RuntimePage />} />
						<Route path="settings" element={<SettingsPage />} />

						<Route path="404" element={<NotFoundPage />} />
						<Route path="*" element={<Navigate to="/404" replace />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</QueryClientProvider>
	);
}

export default App;
