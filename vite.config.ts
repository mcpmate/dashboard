import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import { URL } from "url";
import { defineConfig } from "vite";
import { BUILTIN_MARKET_PORTALS } from "./src/pages/market/portal-registry";

// Minimal dev-time proxy for mcpmarket.cn under /market-proxy

const HOP_BY_HOP_HEADER_SET = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailers",
	"transfer-encoding",
	"upgrade",
	"host",
]);

function buildForwardHeaders(raw: IncomingHttpHeaders): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!value) continue;
		if (HOP_BY_HOP_HEADER_SET.has(key.toLowerCase())) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			headers[key] = value.join(", ");
			continue;
		}
		headers[key] = value;
	}
	if (!headers["accept"]) {
		headers["accept"] = "*/*";
	}
	if (!headers["user-agent"]) {
		headers["user-agent"] = "mcpmate-board-dev-proxy";
	}
	return headers;
}

function marketPortalProxyMiddleware(): any {
	const portals = BUILTIN_MARKET_PORTALS.map((portal) => {
		const normalizedProxyPath = portal.proxyPath.endsWith("/")
			? portal.proxyPath
			: `${portal.proxyPath}/`;
		return {
			...portal,
			proxyPath: normalizedProxyPath,
			prefixNoSlash: normalizedProxyPath.slice(0, -1),
		};
	});

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

	const buildStyleTag = () => `
<style id="mcpmate-market-outline-style">
${readStyleText()}
</style>`;
	const buildShimTag = (portal: (typeof portals)[number]) => {
		const shimSource = readShimTemplate();
		const config = JSON.stringify({
			portalId: portal.id,
			prefix: portal.prefixNoSlash,
			remoteOrigin: portal.remoteOrigin,
			adapter: portal.adapter,
		});
		return `
<script id="mcpmate-market-config">window.__MCPMATE_PORTAL__=${config};</script>
<script id="mcpmate-market-shim">
${shimSource}
</script>`;
	};

	// Escape a string for safe insertion into a RegExp source.
	// Use the canonical character class to escape regex meta characters.
	const escapeRegex = (value: string) =>
		value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const rewriteHtml = (html: string, portal: (typeof portals)[number]) => {
		// 1) Rewrite /_next/ anywhere it's safe and not already proxied
		const nextEverywhere = new RegExp(
			`(?<!${escapeRegex(portal.proxyPath)})/_next/`,
			"g",
		);
		html = html.replace(nextEverywhere, `${portal.proxyPath}_next/`);

		// 2) Rewrite attribute URLs (href/src/action) that begin with '/'
		//    Preserve remainder of the path instead of dropping it
		const attrPattern = new RegExp(
			`(href|src|action)=("|')/(?!${escapeRegex(portal.proxyPath.slice(1))})([^"'>]*)`,
			"g",
		);
		html = html.replace(
			attrPattern,
			(_m: string, attr: string, quote: string, rest: string) =>
				`${attr}=${quote}${portal.proxyPath}${rest}`,
		);

		// 3) Rewrite CSS url(/...) usages, not only _next/static but any absolute path
		const cssUrlPattern = new RegExp(
			String.raw`url\((['"])\/(?!${escapeRegex(portal.proxyPath.slice(1))})([^)]+)\)`,
			"g",
		);
		html = html.replace(
			cssUrlPattern,
			(_m: string, quote: string, rest: string) =>
				`url(${quote}${portal.proxyPath}${rest})`,
		);

		// 4) Special handling for Next.js apps (mcp.so)
		if (portal.id === "mcpso") {
			// Fix Next.js script paths that might use window.location
			html = html.replace(
				/(<script[^>]*>)([^<]*)(<\/script>)/g,
				(_match, openTag, scriptContent, closeTag) => {
					// Fix window.location references in inline scripts
					if (scriptContent.includes("window.location")) {
						scriptContent = scriptContent.replace(
							/window\.location\.href/g,
							`window.location.href.replace('${portal.proxyPath.slice(0, -1)}', '')`,
						);
					}
					return openTag + scriptContent + closeTag;
				},
			);

			// Fix Next.js data attributes that might contain paths
			html = html.replace(
				/(data-(?:next|href|src)=["'])(\/[^"']*)/g,
				`$1${portal.proxyPath}$2`,
			);

			// Fix meta tags with URL content
			html = html.replace(
				/(<meta[^>]*(?:property|name)=["'](?:og:url|twitter:url)["'][^>]*content=["'])(\/[^"']*)/g,
				`$1${portal.proxyPath}$2`,
			);
		}

		const styleTag = buildStyleTag();
		const shimTag = buildShimTag(portal);

		if (html.includes("<head>")) {
			return html.replace(
				"<head>",
				`<head>
${styleTag}
${shimTag}`,
			);
		}
		if (html.includes("</head>")) {
			return html.replace(
				"</head>",
				`${styleTag}
${shimTag}
</head>`,
			);
		}
		return styleTag + shimTag + html;
	};

	return async (req: any, res: any, next: any) => {
		if (!req.url) return next();

		// Fallback: handle escaped absolute paths like /_next/*, /static/*, etc.
		// When a page inside a portal accidentally requests absolute assets,
		// detect the portal by Referer and forward to the correct remote origin.
		const ABSOLUTE_ASSET_PREFIXES = [
			"/_next/",
			"/static/",
			"/assets/",
			"/images/",
		] as const;
		const isEscapedAsset = ABSOLUTE_ASSET_PREFIXES.some((p) =>
			req.url!.startsWith(p),
		);
		if (isEscapedAsset) {
			const referer: string = (req.headers?.referer as string) || "";
			const viaPortal = portals.find(
				(p) =>
					referer.includes(p.proxyPath) || referer.includes(p.prefixNoSlash),
			);
			if (viaPortal) {
				try {
					const targetUrl = new URL(req.url, viaPortal.remoteOrigin);
					const upstream = await fetch(targetUrl.toString(), {
						redirect: "follow",
					});
					const contentType = upstream.headers.get("content-type") || "";
					res.statusCode = upstream.status;
					if (contentType) res.setHeader("content-type", contentType);
					res.setHeader("cache-control", "no-store");
					const buf = Buffer.from(await upstream.arrayBuffer());
					res.end(buf);
					return;
				} catch (_error) {
					// fall through to Vite default
				}
			}
		}

		if (!req.url.startsWith("/market-proxy")) return next();

		const portal = portals.find((entry) => {
			return (
				req.url === entry.prefixNoSlash ||
				req.url === entry.proxyPath ||
				req.url.startsWith(entry.proxyPath)
			);
		});

		if (!portal) return next();

		try {
			const incoming = new URL(req.url, "http://localhost");
			let relativePath = incoming.pathname;
			if (relativePath.startsWith(portal.proxyPath)) {
				relativePath = relativePath.slice(portal.proxyPath.length);
			} else if (relativePath.startsWith(portal.prefixNoSlash)) {
				relativePath = relativePath.slice(portal.prefixNoSlash.length);
			}
			if (!relativePath.startsWith("/")) {
				relativePath = `/${relativePath}`;
			}
			const targetUrl = new URL(relativePath || "/", portal.remoteOrigin);
			targetUrl.search = incoming.search;
			targetUrl.hash = incoming.hash;

			const headers = buildForwardHeaders(req.headers);
			const method = (req.method || "GET").toUpperCase();
			const upstream = await fetch(targetUrl.toString(), {
				method,
				headers,
				redirect: "follow",
				body: method === "GET" || method === "HEAD" ? undefined : (req as any),
			});
			const contentType = upstream.headers.get("content-type") || "";
			res.setHeader("cache-control", "no-store");
			const setCookieHeader =
				typeof (upstream.headers as any).getSetCookie === "function"
					? (upstream.headers as any).getSetCookie()
					: undefined;
			if (
				setCookieHeader &&
				Array.isArray(setCookieHeader) &&
				setCookieHeader.length
			) {
				res.setHeader("set-cookie", setCookieHeader);
			} else {
				const singleSetCookie = upstream.headers.get("set-cookie");
				if (singleSetCookie) {
					res.setHeader("set-cookie", singleSetCookie);
				}
			}
			if (contentType.includes("text/html")) {
				// For Next.js SSR/RSC apps, use streaming to preserve hydration
				if (portal.id === "mcpso" && upstream.body) {
					res.statusCode = upstream.status;
					res.setHeader("content-type", "text/html; charset=utf-8");

					const reader = upstream.body.getReader();
					const decoder = new TextDecoder();
					let buffer = "";
					let headInjected = false;

					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							buffer += decoder.decode(value, { stream: true });

							// Inject config/styles after <head> tag (only once)
							if (!headInjected && buffer.includes("<head>")) {
								const headIndex = buffer.indexOf("<head>") + 6;
								const beforeHead = buffer.substring(0, headIndex);
								const afterHead = buffer.substring(headIndex);

								const styleTag = buildStyleTag();
								const shimTag = buildShimTag(portal);
								const injection = `\n${styleTag}\n${shimTag}\n`;

								// Write the part before injection
								res.write(beforeHead + injection);
								buffer = afterHead;
								headInjected = true;
								continue;
							}

							// Write buffered content (keep small buffer for pattern matching)
							if (buffer.length > 512) {
								const toWrite = buffer.substring(0, buffer.length - 256);
								res.write(toWrite);
								buffer = buffer.substring(buffer.length - 256);
							}
						}

						// Write remaining buffer
						if (buffer) {
							// Last chance to inject if <head> wasn't found
							if (!headInjected && buffer.includes("<head>")) {
								const headIndex = buffer.indexOf("<head>") + 6;
								const styleTag = buildStyleTag();
								const shimTag = buildShimTag(portal);
								buffer =
									buffer.substring(0, headIndex) +
									`\n${styleTag}\n${shimTag}\n` +
									buffer.substring(headIndex);
							}
							res.write(buffer);
						}
						res.end();
					} catch (err) {
						console.error("Streaming error:", err);
						res.end();
					}
					return;
				}

				// Fallback for non-streaming HTML
				let body = await upstream.text();
				body = rewriteHtml(body, portal);
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
			server.middlewares.use(marketPortalProxyMiddleware());
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
	optimizeDeps: {
		exclude: ["lucide-react"],
	},
	server: {
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8080",
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
			"/ws": {
				target: "ws://127.0.0.1:8080",
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
