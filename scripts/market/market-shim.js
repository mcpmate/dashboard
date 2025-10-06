(() => {
	try {
		const prefix = "__MCPMATE_PREFIX__";
		const remoteOrigin = "__MCPMATE_REMOTE__";
		const mapUrl = (input) => {
			try {
				if (!input) return input;
				if (typeof input !== "string") return input;
				if (input.startsWith("http://") || input.startsWith("https://"))
					return input;
				if (input.startsWith(`${prefix}/`)) return input;
				if (input.startsWith("/")) return prefix + input;
				return input;
			} catch {
				return input;
			}
		};
		const rewriteLogoElement = (node) => {
			try {
				if (!node) return;
				const original = node.getAttribute("data-original-url");
				if (original) {
					const mapped = mapUrl(original);
					if (mapped !== original)
						node.setAttribute("data-original-url", mapped);
				}
				const inlineBg = node.style?.backgroundImage;
				if (inlineBg?.includes("url(")) {
					const match = inlineBg.match(/url\(([^)]+)\)/);
					const raw = match?.[1] ? match[1].replace(/^['"]|['"]$/g, "") : null;
					if (raw) {
						const mapped = mapUrl(raw);
						if (mapped !== raw) {
							node.style.backgroundImage = `url(${mapped})`;
						}
					}
				}
				const dataLogo = node.getAttribute("data-logo-url");
				if (dataLogo) {
					const mapped = mapUrl(dataLogo);
					if (mapped !== dataLogo) node.setAttribute("data-logo-url", mapped);
				}
				const targetIcon = original ? mapUrl(original) : null;
				if (
					targetIcon &&
					node.getAttribute("data-mcpmate-icon-url") !== targetIcon
				) {
					node.setAttribute("data-mcpmate-icon-url", targetIcon);
					try {
						const img = new Image();
						img.onload = () => {
							try {
								node.style.backgroundImage = `url(${targetIcon})`;
								node.setAttribute("data-mcpmate-icon-loaded", "1");
							} catch (err) {
								/* noop */
							}
						};
						img.src = targetIcon;
					} catch (err) {
						/* noop */
					}
				}
			} catch {
				/* noop */
			}
		};
		const scanLogos = (root) => {
			try {
				(root || document)
					.querySelectorAll(".server-logo")
					.forEach(rewriteLogoElement);
			} catch {
				/* noop */
			}
		};
		const rewriteAnchors = (root) => {
			try {
				(root || document).querySelectorAll("a[href]").forEach((anchor) => {
					const href = anchor.getAttribute("href");
					const mapped = mapUrl(href);
					if (mapped !== href) anchor.setAttribute("href", mapped);
				});
				(root || document).querySelectorAll("form[action]").forEach((form) => {
					const action = form.getAttribute("action");
					const mapped = mapUrl(action);
					if (mapped !== action) form.setAttribute("action", mapped);
				});
			} catch {
				/* noop */
			}
		};
		const ensureStyles = () => {
			const id = "mcpmate-market-outline-style";
			if (document.getElementById(id)) return;
			const style = document.createElement("style");
			style.id = id;
			style.textContent = `
.mcpmate-code-outline {
  position: relative;
}

.mcpmate-code-outline code {
  background: transparent;
}

.mcpmate-config-button {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 0.2rem 0.6rem;
  min-height: 1.75rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(241, 245, 249, 0.82);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.mcpmate-config-button:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.45);
  outline-offset: 2px;
}

.mcpmate-config-icon {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: url("https://mcpmate.io/logo.svg") center / cover no-repeat;
  flex-shrink: 0;
  filter: invert(0);
}

.mcpmate-config-label {
  display: inline-flex;
  color: inherit;
  max-width: 0;
  opacity: 0;
  transform: translateX(-6px);
  overflow: hidden;
  transition: max-width 0.24s ease, opacity 0.18s ease, transform 0.18s ease, margin-left 0.18s ease;
  margin-left: 0;
}

.mcpmate-code-outline:hover {
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.45);
  background: var(--mcpmate-card-bg, rgba(248, 250, 252, 0.96)) !important;
}

.mcpmate-code-outline:hover .mcpmate-config-icon {
  opacity: 0.9;
}

.mcpmate-code-outline:hover .mcpmate-config-label,
.mcpmate-config-button:focus .mcpmate-config-label {
  max-width: 200px;
  opacity: 1;
  transform: translateX(0);
  margin-left: 0.35rem;
}

.mcpmate-config-button:hover {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(241, 245, 249, 0.92);
}

@media (prefers-color-scheme: dark) {
  .mcpmate-code-outline:hover {
    background: rgba(30, 41, 59, 0.72) !important;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.38), 0 0 0 1px rgba(148, 163, 184, 0.32);
  }

  .mcpmate-config-button {
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(30, 41, 59, 0.56);
  }

  .mcpmate-code-outline:hover .mcpmate-config-button,
  .mcpmate-config-button:focus {
    background: rgba(30, 41, 59, 0.75);
    border-color: rgba(148, 163, 184, 0.55);
  }

  .mcpmate-config-label {
    color: #f8fafc;
  }

  .mcpmate-config-icon {
    filter: invert(1);
  }
}
`;
			document.head.appendChild(style);
		};
		const cleanupKey = "__mcpmateMarketCleanup";
		const stateKey = "__mcpmateMarketCleanupState";
		const previousCleanup =
			typeof window[cleanupKey] === "function" ? window[cleanupKey] : null;
		if (previousCleanup) {
			try {
				previousCleanup();
			} catch {
				/* noop */
			}
		}
		const state = { intervalId: null, observer: null };
		const cleanup = () => {
			try {
				if (typeof state.intervalId === "number") {
					clearInterval(state.intervalId);
				}
			} catch {
				/* noop */
			}
			state.intervalId = null;
			try {
				if (state.observer) {
					state.observer.disconnect();
				}
			} catch {
				/* noop */
			}
			state.observer = null;
			try {
				window.removeEventListener("beforeunload", cleanup);
			} catch {
				/* noop */
			}
			try {
				window.removeEventListener("pagehide", cleanup);
			} catch {
				/* noop */
			}
			window[cleanupKey] = undefined;
			window[stateKey] = undefined;
		};
		try {
			window.addEventListener("beforeunload", cleanup, { once: true });
		} catch {
			/* noop */
		}
		try {
			window.addEventListener("pagehide", cleanup, { once: true });
		} catch {
			/* noop */
		}
		window[cleanupKey] = cleanup;
		window[stateKey] = state;
		const _fetch = window.fetch.bind(window);
		window.fetch = (input, init) => {
			const mapped =
				typeof input === "string"
					? mapUrl(input)
					: input?.url
						? mapUrl(input.url)
						: input;
			if (typeof input === "string") return _fetch(mapped, init);
			if (input && typeof Request !== "undefined" && input instanceof Request) {
				const r = new Request(mapped, input);
				return _fetch(r, init);
			}
			return _fetch(mapped, init);
		};
		const _open = window.XMLHttpRequest?.prototype.open;
		if (_open) {
			window.XMLHttpRequest.prototype.open = function (method, url) {
				const mapped = mapUrl(url);
				return _open.apply(this, [
					method,
					mapped,
					...Array.prototype.slice.call(arguments, 2),
				]);
			};
		}
		try {
			window.open = (url, target, features) => {
				try {
					if (url) window.location.href = mapUrl(url);
				} catch {
					/* noop */
				}
				return window;
			};
			document.addEventListener(
				"click",
				(e) => {
					const a =
						e.target && (e.target.closest ? e.target.closest("a[href]") : null);
					if (!a) return;
					const href = a.getAttribute("href");
					if (!href) return;
					if (a.getAttribute("target") === "_blank") {
						e.preventDefault();
						window.location.href = mapUrl(href);
					}
				},
				{ capture: true },
			);
		} catch {
			/* noop */
		}
		const isPlainObject = (value) =>
			Boolean(value) && typeof value === "object" && !Array.isArray(value);
		const looksLikeServerEntry = (entry) => {
			if (!isPlainObject(entry)) return false;
			const hasCommand = typeof entry.command === "string" || typeof entry.launch === "string";
			const hasArgs = Array.isArray(entry.args) && entry.args.length > 0;
			const hasEnv = isPlainObject(entry.env) && Object.keys(entry.env).length > 0;
			const hasTransport =
				typeof entry.kind === "string" ||
				typeof entry.type === "string" ||
				typeof entry.transport === "string" ||
				typeof entry.url === "string";
			return hasCommand || hasArgs || hasEnv || hasTransport;
		};
		const looksLikeServersCollection = (value) => {
			if (Array.isArray(value)) {
				return value.some(looksLikeServerEntry);
			}
			if (isPlainObject(value)) {
				return Object.values(value).some(looksLikeServerEntry);
			}
			return false;
		};
		const looksLikeMcpJson = (obj) => {
			if (!isPlainObject(obj)) return false;
			if (obj.mcp && isPlainObject(obj.mcp)) {
				if (looksLikeServersCollection(obj.mcp.servers)) return true;
				if (looksLikeServersCollection(obj.mcp.server)) return true;
			}
			if (looksLikeServersCollection(obj.mcpServers)) return true;
			if (looksLikeServersCollection(obj.servers)) return true;
			if (looksLikeServerEntry(obj)) return true;
			return false;
		};
		const tryParseJsonConfig = (rawText) => {
			const trimmed = rawText.trim();
			if (!trimmed) return false;
			const candidate = (() => {
				if (/^[\[{]/.test(trimmed)) return trimmed;
				const firstBrace = trimmed.indexOf("{");
				const lastBrace = trimmed.lastIndexOf("}");
				if (firstBrace >= 0 && lastBrace > firstBrace) {
					return trimmed.slice(firstBrace, lastBrace + 1);
				}
				return trimmed;
			})();
			try {
				const parsed = JSON.parse(candidate);
				return looksLikeMcpJson(parsed) ? candidate : false;
			} catch {
				return false;
			}
		};
		const looksLikeTomlConfig = (rawText) => {
			const text = rawText.trim();
			if (!text) return false;
			const hasSection =
				/\[\s*(?:mcp(?:\.[^\]]+)?|mcp_servers[^\]]*|servers)\s*\]/i.test(text) ||
				/\[\[\s*servers\s*\]\]/i.test(text);
			const keyHits = text.match(/^(\s*)(command|args|env|type|kind|transport|url|binary)\s*=\s*/gim);
			if (hasSection && keyHits && keyHits.length >= 1) return text;
			if (keyHits && keyHits.length >= 2) return text;
			return false;
		};
		const detectConfigSnippet = (text) => {
			const content = text.trim();
			if (!content) return null;
			const jsonCandidate = tryParseJsonConfig(content);
			if (jsonCandidate) {
				return { format: "json", text: jsonCandidate };
			}
			const tomlCandidate = looksLikeTomlConfig(content);
			if (tomlCandidate) {
				return { format: "toml", text: tomlCandidate };
			}
			return null;
		};
		const toRemoteUrl = () => {
			try {
				const current = new URL(window.location.href);
				if (current.pathname.startsWith(prefix)) {
					const remote = new URL(remoteOrigin);
					const rest = current.pathname.slice(prefix.length);
					remote.pathname = rest || '/';
					remote.search = current.search;
					remote.hash = current.hash;
					return remote.toString();
				}
				return current.toString();
			} catch {
				return window.location.href;
			}
		};
		const ensureImportButton = (pre, detection) => {
			let button = pre.querySelector(".mcpmate-config-button");
			if (!button) {
				button = document.createElement("button");
				button.type = "button";
				button.className = "mcpmate-config-button";
				button.setAttribute("aria-label", "Import configuration into MCPMate");
				const icon = document.createElement("span");
				icon.className = "mcpmate-config-icon";
				const label = document.createElement("span");
				label.className = "mcpmate-config-label";
				label.textContent = "MCPMate";
				button.append(icon);
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					const payload = {
						type: "mcpmate-market-import",
						payload: {
							text:
								typeof button.__mcpmateConfig === "string"
									? button.__mcpmateConfig
									: "",
							format: button.dataset.mcpmateFormat ?? "unknown",
							source: toRemoteUrl(),
						},
					};
					try {
						if (window?.parent && window.parent !== window) {
							window.parent.postMessage(payload, "*");
						}
					} catch {
						/* noop */
					}
				});
				pre.appendChild(button);
			}
			button.dataset.mcpmateFormat = detection.format;
			button.querySelectorAll(".mcpmate-config-label").forEach((node) => node.remove());
			const textNode = document.createElement("span");
			textNode.className = "mcpmate-config-label";
			textNode.textContent = "MCPMate";
			button.appendChild(textNode);
			button.__mcpmateConfig = detection.text;
		};
		const removeImportButton = (pre) => {
			const button = pre.querySelector(".mcpmate-config-button");
			if (button) {
				delete button.__mcpmateConfig;
				button.remove();
			}
		};
		const mark = (root) => {
			try {
				const scope = root || document;
				ensureStyles();
				scope.querySelectorAll("pre").forEach((pre) => {
					const code = pre.querySelector("code");
					const snippet = code?.textContent ?? pre.textContent ?? "";
					const detection = detectConfigSnippet(snippet);
					if (detection) {
						pre.classList.add("mcpmate-code-outline");
						pre.setAttribute("data-mcpmate-highlight", detection.format);
						ensureImportButton(pre, detection);
					} else {
						pre.classList.remove("mcpmate-code-outline");
						pre.removeAttribute("data-mcpmate-highlight");
						removeImportButton(pre);
					}
				});
				rewriteAnchors(root);
			} catch {
				/* noop */
			}
		};
		if (document.readyState === "loading") {
			document.addEventListener(
				"DOMContentLoaded",
				() => {
					mark(document);
					scanLogos(document);
					rewriteAnchors(document);
				},
				{ once: true },
			);
		} else {
			mark(document);
			scanLogos(document);
			rewriteAnchors(document);
		}
		state.intervalId = window.setInterval(() => {
			mark(document);
			scanLogos(document);
			rewriteAnchors(document);
		}, 1000);
		const target = document.getElementById("readme-content") || document.body;
		try {
			const mo = new MutationObserver((muts) => {
				for (const m of muts) {
					if (m.addedNodes) {
						m.addedNodes.forEach((n) => {
							if (n && n.nodeType === 1) {
								mark(n);
								scanLogos(n);
								rewriteAnchors(n);
							}
						});
					}
				}
			});
			state.observer = mo;
			mo.observe(target, { childList: true, subtree: true });
		} catch {
			/* noop */
		}
	} catch (e) {
		console.warn("[mcpmate] market shim failed", e);
	}
})();
