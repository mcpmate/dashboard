# Uni-Import Ingest Notes (Board)

This document summarizes how the dashboard ingests and normalizes dropped/pasted content for server installation.

## Supported inputs

- JSON (preferred): full objects, fenced code blocks (```json), or extracted `{ ... }` slices
- JSON fragments: top-level key lists without outer braces (e.g. `"Context7": { ... }`) — we wrap with `{}` and preserve names via `mcpServers`
- JSON5 features: comments, single quotes, trailing commas (via `json5` fallback)
- TOML: full text or fenced (```toml), section windows like `[mcp_servers.*]` or `[[servers]]`
- MCP bundles: `.mcpb` zip with `manifest.json` (DXT is attempted via same path but not guaranteed)

## Normalization pipeline

1) Try JSON → JSON5 → fenced code → missing braces heuristic → `{ ... }` slice
2) Try TOML: full/fenced/section-window/key-window; convert `mcp_servers` → `mcpServers`
3) Build drafts via `draftFromJson` → `buildDraft` with field aliasing and meta normalization

## Notes

- Names: For JSON fragments like `"Name": { ... }`, we emit `{ mcpServers: { Name: {...} } }` so the name is preserved.
- Kind normalization: `stdio|command|process` → stdio; `sse|server-sent-events` → sse; `streamable_http|http|http_stream` → streamable_http.
- Headers/Env: Non-stdio branches currently reuse key-value dict as headers. Stdio uses `env`.
- Drawer lifecycle: Values are cached in-memory; closing the drawer clears cache.

## Extension points

- Add detectors (URL, YAML) next to existing JSON/TOML heuristics.
- Consider backend fetch with SSRF guard for URL inputs if needed.

