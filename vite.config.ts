import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	optimizeDeps: {
		exclude: ["lucide-react"],
	},
	server: {
		proxy: {
			// Forward API requests to backend
			"/api": {
				target: "http://localhost:8080",
				changeOrigin: true,
				secure: false,
				configure: (proxy) => {
					proxy.on("proxyReq", (proxyReq) => {
						// Remove Origin header in dev to bypass backend allowlist; safe for local only
						try { proxyReq.removeHeader("origin"); } catch { /* noop */ }
					});
				},
			},
			// Forward WebSocket requests to backend
			"/ws": {
				target: "ws://localhost:8080",
				ws: true,
				changeOrigin: true,
				secure: false,
				configure: (proxy) => {
					proxy.on("proxyReqWs", (proxyReq) => { try { proxyReq.removeHeader("origin"); } catch { /* noop */ } });
				},
			},
		},
	},
});
