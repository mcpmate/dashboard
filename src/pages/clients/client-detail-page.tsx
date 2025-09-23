import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useEffect, useId, useState } from "react";
import { clientsApi } from "../../lib/api";
import type { ClientBackupEntry, ClientBackupPolicySetReq, ClientConfigMode, ClientConfigSelected } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useToast } from "../../components/ui/use-toast";
import { RefreshCw, RotateCcw, Trash2, Upload, ArrowLeft } from "lucide-react";

export function ClientDetailPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");

  // Try to get display name from list cache
  useEffect(() => {
    const cached = qc.getQueryData<any>(["clients"]);
    if (cached?.client) {
      const found = cached.client.find((c: any) => c.identifier === identifier);
      if (found) setDisplayName(found.display_name);
    }
  }, [identifier, qc]);

  const modeId = useId();
  const sourceId = useId();
  const limitId = useId();
  const [mode, setMode] = useState<ClientConfigMode>("hosted");
  const [selectedConfig, setSelectedConfig] = useState<ClientConfigSelected>("default");
  const [preview, setPreview] = useState(false);

  const { data: configDetails, isLoading: loadingConfig, refetch: refetchDetails } = useQuery({
    queryKey: ["client-config", identifier],
    queryFn: () => clientsApi.configDetails(identifier || "", false),
    enabled: !!identifier,
  });

  const { data: backupsData, isLoading: loadingBackups, refetch: refetchBackups } = useQuery({
    queryKey: ["client-backups", identifier],
    queryFn: () => clientsApi.listBackups(identifier || undefined),
    enabled: !!identifier,
  });

  const backups: ClientBackupEntry[] = backupsData?.backups || [];

  const { data: policyData, refetch: refetchPolicy } = useQuery({
    queryKey: ["client-policy", identifier],
    queryFn: () => clientsApi.getBackupPolicy(identifier || ""),
    enabled: !!identifier,
  });

  const applyMutation = useMutation({
    mutationFn: () => clientsApi.applyConfig({ identifier: identifier!, mode, selected_config: selectedConfig, preview }),
    onSuccess: () => {
      toast({ title: preview ? "Preview generated" : "Applied", description: preview ? "Preview OK" : "Configuration applied" });
      qc.invalidateQueries({ queryKey: ["client-config", identifier] });
    },
    onError: (e) => toast({ title: "Apply failed", description: String(e), variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: () => clientsApi.configDetails(identifier!, true),
    onSuccess: () => toast({ title: "Imported", description: "Servers imported from client config (if any)" }),
    onError: (e) => toast({ title: "Import failed", description: String(e), variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ backup }: { backup: string }) => clientsApi.restoreConfig({ identifier: identifier!, backup }),
    onSuccess: () => { toast({ title: "Restored", description: "Configuration restored from backup" }); refetchDetails(); refetchBackups(); },
    onError: (e) => toast({ title: "Restore failed", description: String(e), variant: "destructive" }),
  });

  const deleteBackupMutation = useMutation({
    mutationFn: ({ backup }: { backup: string }) => clientsApi.deleteBackup(identifier!, backup),
    onSuccess: () => { toast({ title: "Deleted", description: "Backup deleted" }); refetchBackups(); },
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });

  const setPolicyMutation = useMutation({
    mutationFn: (payload: ClientBackupPolicySetReq) => clientsApi.setBackupPolicy(payload),
    onSuccess: () => { toast({ title: "Saved", description: "Backup policy updated" }); refetchPolicy(); },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const [policyLabel, setPolicyLabel] = useState<string>("keep_n");
  const [policyLimit, setPolicyLimit] = useState<number | undefined>(30);
  useEffect(() => { if (policyData) { setPolicyLabel(policyData.policy || "keep_n"); setPolicyLimit(policyData.limit ?? undefined); } }, [policyData]);

  if (!identifier) return <div className="p-4">No client identifier provided.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/clients"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></Link>
          <h2 className="text-3xl font-bold tracking-tight">{displayName || identifier}</h2>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="apply">Apply</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {loadingConfig ? (
                <div className="animate-pulse h-16 bg-slate-200 dark:bg-slate-800 rounded" />
              ) : configDetails ? (
                <>
                  <div>Config Path: <span className="font-mono">{configDetails.config_path}</span></div>
                  <div>Exists: {String(configDetails.config_exists)}</div>
                  <div>MCP Config: {String(configDetails.has_mcp_config)} (Servers: {configDetails.mcp_servers_count})</div>
                  <div>Last Modified: {configDetails.last_modified || "-"}</div>
                </>
              ) : (
                <div className="text-slate-500">No details available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apply">
          <Card>
            <CardHeader><CardTitle>Apply Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={modeId}>Mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as ClientConfigMode)}>
                    <SelectTrigger id={modeId}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hosted">hosted</SelectItem>
                      <SelectItem value="transparent">transparent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={sourceId}>Source</Label>
                  <Select value={selectedConfig} onValueChange={(v) => setSelectedConfig(v as ClientConfigSelected)}>
                    <SelectTrigger id={sourceId}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">default</SelectItem>
                      <SelectItem value="profile">profile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Preview</Label>
                  <div className="flex items-center gap-2"><Switch checked={preview} onCheckedChange={setPreview} /><span className="text-xs text-slate-500">Only generate preview</span></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}><Upload className="mr-2 h-4 w-4" />{preview ? "Preview" : "Apply"}</Button>
                <Button variant="outline" onClick={() => refetchDetails()} disabled={loadingConfig}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                <Button variant="outline" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>Import Servers</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups">
          <Card>
            <CardHeader><CardTitle>Backups</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loadingBackups ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />)}</div>
              ) : (backups.filter(b => b.identifier === identifier).length ? (
                <div className="space-y-2">
                  {backups.filter(b => b.identifier === identifier).map((b) => (
                    <div key={b.path} className="flex items-center justify-between rounded border p-3 text-sm">
                      <div className="space-y-0.5"><div className="font-mono">{b.backup}</div><div className="text-slate-500">{b.created_at || "-"} • {(b.size/1024).toFixed(1)} KB</div></div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => restoreMutation.mutate({ backup: b.backup })}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteBackupMutation.mutate({ backup: b.backup })}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-slate-500 text-sm">No backups.</div>)}
              <div className="mt-3"><Button variant="outline" onClick={() => refetchBackups()} disabled={loadingBackups}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy">
          <Card>
            <CardHeader><CardTitle>Backup Policy</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label>Policy</Label>
                <Select value={policyLabel} onValueChange={setPolicyLabel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="keep_n">keep_n</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={limitId}>Limit</Label>
                <Input id={limitId} type="number" min={0} value={policyLimit ?? 0} onChange={(e) => setPolicyLimit(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Button onClick={() => setPolicyMutation.mutate({ identifier: identifier!, policy: { label: policyLabel, limit: policyLimit } })} disabled={setPolicyMutation.isPending}>Save Policy</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ClientDetailPage;

