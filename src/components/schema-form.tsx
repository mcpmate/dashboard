import { useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";

export type JSONSchema = any; // Lightweight compatibility

export function defaultFromSchema(schema: JSONSchema): any {
  try {
    if (!schema) return {};
    if (schema.default !== undefined) return schema.default;
    const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (schema.enum && schema.enum.length) return schema.enum[0];
    switch ((t || 'object').toLowerCase()) {
      case 'string': return schema.examples?.[0] ?? 'example';
      case 'integer': return 1;
      case 'number': return 1;
      case 'boolean': return true;
      case 'array': {
        const item = defaultFromSchema(schema.items || { type: 'string' });
        return [item];
      }
      case 'object': {
        const o: Record<string, any> = {};
        const props = schema.properties || {};
        Object.keys(props).forEach((k) => { o[k] = defaultFromSchema(props[k]); });
        return o;
      }
      default: return 'example';
    }
  } catch { return {}; }
}

type FieldProps = {
  name: string;
  schema: JSONSchema;
  required?: boolean;
  value: any;
  onChange: (v: any) => void;
};

function Field({ name, schema, required, value, onChange }: FieldProps) {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  const enumVals: any[] | undefined = schema?.enum;
  const label = `${name}${required ? ' *' : ''}`;
  const desc = schema?.description as string | undefined;

  if (enumVals && enumVals.length) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select value={String(value ?? enumVals[0])} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {enumVals.map((e, i) => (<SelectItem key={`${name}-${i}`} value={String(e)}>{String(e)}</SelectItem>))}
          </SelectContent>
        </Select>
        {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <Switch checked={!!value} onCheckedChange={(v) => onChange(v)} />
          <span className="text-xs text-slate-500">{String(value)}</span>
        </div>
        {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
      </div>
    );
  }

  if (type === 'integer' || type === 'number') {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : (type==='integer' ? parseInt(e.target.value) : parseFloat(e.target.value)))} />
        {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
      </div>
    );
  }

  if (type === 'array') {
    const itemsSchema = schema?.items || { type: 'string' };
    const arr: any[] = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <div className="space-y-2">
          {arr.map((v, idx) => (
            <div key={`${name}-${idx}`} className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Field name={`${name}[${idx}]`} schema={itemsSchema} value={v} onChange={(nv)=>{
                const next = [...arr]; next[idx] = nv; onChange(next);
              }} />
              <button type="button" className="text-xs rounded border px-2 py-1 hover:bg-accent" onClick={()=>{
                const next = arr.filter((_,i)=> i!==idx); onChange(next);
              }}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-xs rounded border px-2 py-1 hover:bg-accent" onClick={()=>{
            onChange([...(arr||[]), defaultFromSchema(itemsSchema)]);
          }}>Add item</button>
        </div>
        {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
      </div>
    );
  }

  if (type === 'object') {
    const props = schema?.properties || {};
    const req: string[] = Array.isArray(schema?.required) ? schema.required : [];
    const obj: Record<string, any> = value && typeof value === 'object' ? value : {};
    const keys = Object.keys(props);
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="grid grid-cols-1 gap-3">
          {keys.map((k) => (
            <Field key={k} name={k} schema={props[k]} required={req.includes(k)} value={obj[k]} onChange={(nv)=> onChange({ ...obj, [k]: nv })} />
          ))}
        </div>
        {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
      </div>
    );
  }

  // string and fallback
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {schema?.format === 'textarea' ? (
        <Textarea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {desc ? <div className="text-xs text-slate-500">{desc}</div> : null}
    </div>
  );
}

export function SchemaForm({ schema, value, onChange }: { schema: JSONSchema; value: any; onChange: (v:any)=>void }) {
  const props = schema?.properties || {};
  const req: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const keys = Object.keys(props);
  const obj: Record<string, any> = value && typeof value === 'object' ? value : {};
  return (
    <div className="grid grid-cols-1 gap-3">
      {keys.map((k) => (
        <Field key={k} name={k} schema={props[k]} required={req.includes(k)} value={obj[k]} onChange={(nv)=> onChange({ ...obj, [k]: nv })} />
      ))}
    </div>
  );
}
