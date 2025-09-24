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
					proxy.on("proxyReq", (proxyReq, req) => {
						try {
							// Backend recently introduced Origin allowlist (403 protection).
							// To keep local development stable, remove Origin when forwarding, allowing backend to skip validation.
							// Production environment will not go through Vite proxy, so it is not affected.
							proxyReq.removeHeader("origin");
						} catch {}
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
					proxy.on("proxyReqWs", (proxyReq) => {
						try {
							proxyReq.removeHeader("origin");
						} catch {}
					});
				},
			},
		},
	},
});
