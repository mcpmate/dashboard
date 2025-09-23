import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, Settings, ToggleLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { useToast } from "../../components/ui/use-toast";
import { clientsApi } from "../../lib/api";

export function ClientsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const resp = await clientsApi.list(false);
      return resp;
    },
    staleTime: 10_000,
  });

  const clients = data?.client ?? [];


  const manageMutation = useMutation({
    mutationFn: async ({ identifier, managed }: { identifier: string; managed: boolean }) => {
      const result = await clientsApi.manage(identifier, managed ? "enable" : "disable");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Updated", description: "Client management state updated" });
    },
    onError: (err) => {
      toast({ title: "Operation failed", description: String(err), variant: "destructive" });
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await clientsApi.list(true);
    } catch {}
    await refetch();
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={isRefetching || refreshing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching || refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detected Clients</CardTitle>
              <CardDescription>Enable MCPMate management for supported host applications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="h-9 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : clients.length > 0 ? (
            <div className="space-y-3">
              {clients.map((c) => (
                <div key={c.identifier} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{c.display_name}</h3>
                      {c.detected ? (
                        <span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                          <Check className="mr-1 h-3 w-3" /> Detected
                        </span>
                      ) : (
                        <Badge variant="secondary">Not Detected</Badge>
                      )}
                      {c.has_mcp_config ? <Badge>Configured</Badge> : <Badge variant="outline">No Config</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">{c.identifier}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Servers: {c.mcp_servers_count ?? 0}</span>
                      <span>Config: {c.config_path}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.managed}
                      onCheckedChange={(checked) =>
                        manageMutation.mutate({ identifier: c.identifier, managed: checked })
                      }
                      disabled={manageMutation.isPending}
                    />
                    <Link to={`/clients/${encodeURIComponent(c.identifier)}`}>
                      <Button size="sm" variant="outline">
                        <Settings className="mr-2 h-4 w-4" />
                        Details
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ToggleLeft className="mx-auto h-12 w-12 text-slate-400 mb-4" />
              <p className="text-slate-500 mb-2">No clients found</p>
              <p className="text-sm text-slate-400">Make sure MCPMate backend is running and detection is enabled</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details moved to dedicated page */}
    </div>
  );
}

export default ClientsPage;
