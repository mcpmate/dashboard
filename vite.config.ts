import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import path from "path";
import { URL } from "url";
import { defineConfig } from "vite";

// Minimal dev-time proxy for mcpmarket.cn under /market-proxy
function mcpMarketProxyMiddleware(): any {
	const remoteOrigin = "https://mcpmarket.cn";
	const prefix = "/market-proxy";
	const assetsDir = path.resolve(__dirname, "scripts/market");
	const stylePath = path.join(assetsDir, "market-style.css");
	const shimPath = path.join(assetsDir, "market-shim.js");
	const shouldCacheAssets = process.env.NODE_ENV === "production";
	let cachedStyleText: string | null = null;
	let cachedShimTemplate: string | null = null;
	const readStyleText = () => {
		if (!shouldCacheAssets || cachedStyleText === null) {
			try {
				cachedStyleText = readFileSync(stylePath, "utf-8");
			} catch (error) {
				console.error("[mcpmate] failed to load market style", error);
				cachedStyleText = "";
			}
		}
		return cachedStyleText;
	};
	const readShimTemplate = () => {
		if (!shouldCacheAssets || cachedShimTemplate === null) {
			try {
				cachedShimTemplate = readFileSync(shimPath, "utf-8");
			} catch (error) {
				console.error("[mcpmate] failed to load market shim", error);
				cachedShimTemplate = "";
			}
		}
		return cachedShimTemplate;
	};
	const buildStyleTag = () =>
		`\n<style id="mcpmate-market-outline-style">\n${readStyleText()}\n</style>`;
	const buildShimTag = () => {
		const shimSource = readShimTemplate()
			.replace(/__MCPMATE_PREFIX__/g, prefix)
			.replace(/__MCPMATE_REMOTE__/g, remoteOrigin);
		return `\n<script id="mcpmate-market-shim">\n${shimSource}\n</script>`;
	};

	function rewriteHtml(html: string): string {
		// Prefix root-relative URLs (/, excluding already rewritten /market-proxy)
		html = html.replace(
			/(href|src|action)=("|')\/(?!market-proxy\/)\/?/g,
			`$1=$2${prefix}/`,
		);

		// Fix static asset URLs specifically for images
		html = html.replace(/url\(['"]?\/static\//g, `url('${prefix}/static/`);

		const styleTag = buildStyleTag();
		const shim = buildShimTag();

		if (html.includes("<head>"))
			return html.replace("<head>", `<head>\n${styleTag}\n${shim}`);
		if (html.includes("</head>"))
			return html.replace("</head>", `${styleTag}\n${shim}\n</head>`);
		return styleTag + shim + html;
	}

	return async (req: any, res: any, next: any) => {
		if (!req.url) return next();
		if (!req.url.startsWith(prefix)) return next();
		try {
			const path = req.url.slice(prefix.length) || "/";
			const target = new URL(path, remoteOrigin);
			const headers: Record<string, string> = {
				accept: (req.headers["accept"] as string) || "*/*",
				"user-agent":
					(req.headers["user-agent"] as string) || "mcpmate-board-dev-proxy",
			};
			const upstream = await fetch(target.toString(), {
				headers,
				redirect: "follow",
			});
			const contentType = upstream.headers.get("content-type") || "";
			res.setHeader("cache-control", "no-store");
			if (contentType.includes("text/html")) {
				let body = await upstream.text();
				body = rewriteHtml(body);
				res.setHeader("content-type", "text/html; charset=utf-8");
				res.statusCode = upstream.status;
				res.end(body);
				return;
			}
			res.statusCode = upstream.status;
			if (contentType) res.setHeader("content-type", contentType);
			const buf = Buffer.from(await upstream.arrayBuffer());
			res.end(buf);
		} catch (err) {
			res.statusCode = 502;
			res.end(`Market proxy error: ${String(err)}`);
		}
	};
}

function marketProxyPlugin() {
	return {
		name: "mcpmate-market-proxy",
		configureServer(server: any) {
			server.middlewares.use(mcpMarketProxyMiddleware());
		},
	} as any;
}

export default defineConfig({
	plugins: [react(), marketProxyPlugin()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	optimizeDeps: { exclude: ["lucide-react"] },
	server: {
		proxy: {
			// Board backend API
			"/api": {
				target: "http://localhost:8080",
				changeOrigin: true,
				secure: false,
				configure: (proxy: any) => {
					proxy.on("proxyReq", (proxyReq: any) => {
						try {
							proxyReq.removeHeader("origin");
						} catch {
							/* noop */
						}
					});
				},
			},
			// Forward market subrequests (assets, APIs) when called via our prefix
			"/market-proxy": {
				target: "https://mcpmarket.cn",
				changeOrigin: true,
				secure: true,
				rewrite: (p: string) => p,
			},
			// Proxy static assets from mcpmarket.cn
			"/static": {
				target: "https://mcpmarket.cn",
				changeOrigin: true,
				secure: true,
				rewrite: (p: string) => p,
			},
			// Backend WS
			"/ws": {
				target: "ws://localhost:8080",
				ws: true,
				changeOrigin: true,
				secure: false,
				configure: (proxy: any) => {
					proxy.on("proxyReqWs", (proxyReq: any) => {
						try {
							proxyReq.removeHeader("origin");
						} catch {
							/* noop */
						}
					});
				},
			},
		},
	},
});
