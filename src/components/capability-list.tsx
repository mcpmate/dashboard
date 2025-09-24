import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

type CapabilityKind = "tools" | "resources" | "prompts" | "templates";
type ContextType = "server" | "profile";

export interface CapabilityListProps<T = any> {
  title?: string;
  kind: CapabilityKind;
  context?: ContextType;
  items: T[];
  loading?: boolean;
  filterText?: string; // external filter control
  onFilterTextChange?: (text: string) => void; // show search when provided
  emptyText?: string;
  enableToggle?: boolean;
  getId?: (item: T) => string;
  getEnabled?: (item: T) => boolean;
  onToggle?: (id: string, next: boolean, item: T) => void;
  // Optional bulk-selection support
  selectable?: boolean;
  selectedIds?: string[];
  onSelectToggle?: (id: string, item: T) => void;
  // Render options
  asCard?: boolean; // when false, render list only (no outer Card/Header)
}

// Heuristic helpers to extract display fields from heterogeneous capability payloads
function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

// Normalize common escaped newlines (e.g., "\n") to real line breaks for display
function normalizeMultiline(text?: string): string | undefined {
  if (!text) return text;
  try {
    // Replace CRLF and LF escape sequences, keep other characters as-is
    return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  } catch {
    return text;
  }
}

function mapItem(kind: CapabilityKind, item: any) {
  if (kind === "tools") {
    const unique = asString(item.unique_name);
    const name = asString(item.tool_name) || asString(item.name);
    const title = unique || name || asString(item.id) || "Untitled Tool";
    const description = normalizeMultiline(asString(item.description));
    // MCP tool input schema (best effort)
    const schema = item.input_schema || item.schema || undefined;
    const args = Array.isArray(item.arguments) ? item.arguments : undefined;
    return { title, subtitle: unique && name && unique !== name ? `Name: ${name}` : undefined, description, server: asString(item.server_name), raw: item, schema, args };
  }
  if (kind === "resources") {
    const title = asString(item.resource_uri) || asString(item.uri) || asString(item.name) || "Resource";
    const description = normalizeMultiline(asString(item.description));
    return { title, subtitle: asString(item.name), server: asString(item.server_name), mime: asString(item.mime_type), description, raw: item };
  }
  if (kind === "prompts") {
    const title = asString(item.prompt_name) || asString(item.name) || "Prompt";
    const description = normalizeMultiline(asString(item.description));
    const args = Array.isArray(item.arguments) ? item.arguments : undefined;
    return { title, subtitle: asString(item.server_name), description, args, raw: item };
  }
  // templates
  const title = asString(item.uri_template) || asString(item.name) || "Template";
  const description = normalizeMultiline(asString(item.description));
  return { title, subtitle: asString(item.server_name), description, raw: item };
}

function matchText(obj: any, needle: string): boolean {
  if (!needle) return true;
  const t = needle.toLowerCase();
  try {
    // Prefer common fields first
    const fields = [
      obj.title,
      obj.subtitle,
      obj.server,
      obj.description,
    ]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase();
    if (fields.includes(t)) return true;
    return JSON.stringify(obj.raw).toLowerCase().includes(t);
  } catch {
    return false;
  }
}

export function CapabilityList<T = any>({
  title,
  kind,
  context = "server",
  items,
  loading,
  filterText,
  onFilterTextChange,
  emptyText,
  enableToggle,
  getId,
  getEnabled,
  onToggle,
  selectable,
  selectedIds,
  onSelectToggle,
  asCard,
}: CapabilityListProps<T>) {
  const [internalFilter, setInternalFilter] = useState("");
  const search = filterText ?? internalFilter;

  const data = useMemo(() => {
    const mapped = (items || []).map((it) => mapItem(kind, it));
    return mapped.filter((m) => matchText(m, search));
  }, [items, kind, search]);

  const list = (
      <div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
            ))}
          </div>
        ) : data.length ? (
          <ul className="text-sm space-y-3">
            {data.map((m, idx) => {
              const item = (items as any[])[idx];
              const id = getId ? getId(item) : String(idx);
              return (
                <li
                  key={id}
                  className={`rounded border p-3 ${selectable && selectedIds?.includes(id) ? "bg-accent/50 ring-1 ring-primary/40" : ""}`}
                  role={selectable ? "button" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onClick={() => {
                    if (selectable && onSelectToggle) onSelectToggle(id, item);
                  }}
                  onKeyDown={(e) => {
                    if (!selectable || !onSelectToggle) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectToggle(id, item);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {m.title}
                        {m.subtitle ? (
                          <span className="ml-2 text-xs text-slate-500">{m.subtitle}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {m.server ? <span className="mr-3">Server: {m.server}</span> : null}
                        {m.mime ? <span>Mime: {m.mime}</span> : null}
                      </div>
                      {m.description ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{m.description}</div>
                      ) : null}

                      {/* Smart details */}
                      <details className="mt-2">
                        <summary className="text-xs text-slate-500 cursor-pointer">Details</summary>
                        <div className="mt-2 space-y-2">
                          {/* Arguments for tools/prompts */}
                          {Array.isArray(m.args) && m.args.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-left text-slate-500">
                                    <th className="border-b py-1 pr-2">Argument</th>
                                    <th className="border-b py-1 pr-2">Required</th>
                                    <th className="border-b py-1 pr-2">Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.args.map((a: any, i: number) => (
                                    <tr key={i}>
                                      <td className="border-b py-1 pr-2 font-mono">{asString(a.name) || `arg_${i}`}</td>
                                      <td className="border-b py-1 pr-2">{String(!!a.required)}</td>
                                      <td className="border-b py-1 pr-2">{asString(a.description) || ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {/* Simple JSON Schema table for tools */}
                          {m.schema && typeof m.schema === "object" && m.schema.properties ? (
                            <div className="overflow-x-auto">
                              <div className="text-xs text-slate-500 mb-1">Input Schema</div>
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-left text-slate-500">
                                    <th className="border-b py-1 pr-2">Property</th>
                                    <th className="border-b py-1 pr-2">Type</th>
                                    <th className="border-b py-1 pr-2">Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.keys(m.schema.properties).map((k) => {
                                    const p = (m.schema.properties as any)[k];
                                    return (
                                      <tr key={k}>
                                        <td className="border-b py-1 pr-2 font-mono">{k}</td>
                                        <td className="border-b py-1 pr-2">{asString(p?.type) || (Array.isArray(p?.type) ? p.type.join("|") : "-")}</td>
                                        <td className="border-b py-1 pr-2">{asString(p?.description) || ""}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {/* Raw fallback */}
                          <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded max-w-full overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(m.raw, null, 2)}</pre>
                        </div>
                      </details>
                    </div>

                    <div className="flex items-center gap-2">
                      {context === "profile" && enableToggle && getEnabled && onToggle ? (
                        <div className="flex items-center gap-2 text-xs">
                          {getEnabled(item) ? (
                            <Badge>Enabled</Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                          <Switch
                            checked={!!getEnabled(item)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(next) => onToggle(id, next, item)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">{emptyText || "No data."}</div>
        )}
      </div>
  );

  if (asCard === false) {
    return list as any;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title ?? kind[0].toUpperCase() + kind.slice(1)}</CardTitle>
          {typeof onFilterTextChange === "function" || filterText === undefined ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder={`Search ${kind}...`}
                className="w-56"
                value={search}
                onChange={(e) => {
                  if (onFilterTextChange) onFilterTextChange(e.target.value);
                  else setInternalFilter(e.target.value);
                }}
              />
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  );
}

export default CapabilityList;
