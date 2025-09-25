import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { serversApi } from "../../lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { notifyError, notifySuccess } from "../../lib/notify";
import { StatusBadge } from "../../components/status-badge";
import { ServerFormDrawer } from "../../components/server-form-drawer";
import { Edit3, MoreHorizontal, Play, RefreshCw, Square, Trash2, Link as LinkIcon } from "lucide-react";
import CapabilityList from "../../components/capability-list";
import InspectorDrawer from "../../components/inspector-drawer";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";

export function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: server, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => serversApi.getServer(serverId || ""),
    enabled: !!serverId,
  });

  const toggleServerM = useMutation({
    mutationFn: async () => {
      if (!serverId || !server) throw new Error("Server ID is required");
      const running = server.instances?.some((i) => String(i.status).toLowerCase() === "ready" || String(i.status).toLowerCase() === "busy");
      return running ? serversApi.stopServer(serverId) : serversApi.startServer(serverId);
    },
    onSuccess: () => {
      notifySuccess("Server state updated");
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
    },
    onError: (e) => notifyError("Operation failed", String(e)),
  });

  const deleteServerM = useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error("Server ID is required");
      return serversApi.deleteServer(serverId);
    },
    onSuccess: () => {
      notifySuccess("Server deleted");
      // Ensure the list view reflects the deletion immediately
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.removeQueries({ queryKey: ["server", serverId] });
      navigate("/servers");
    },
    onError: (e) => notifyError("Delete failed", String(e)),
  });

  if (!serverId) return <div className="p-4">No server ID provided</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight">{server?.name || serverId}</h2>
          {server ? <StatusBadge status={server.status} instances={server.instances || []} /> : null}
        </div>
      </div>

      {/* Edit Drawer */}
      {server && (
        <ServerFormDrawer
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          initialData={{
            name: server.name,
            kind: (server.kind as any) || "stdio",
            command: server.command,
            args: Array.isArray(server.args) ? server.args : [],
            env: server.env || {},
          }}
          onSubmit={async (data) => {
            await serversApi.updateServer(serverId, data);
            setIsEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ["server", serverId] });
          }}
          title="Edit Server"
          submitLabel="Update"
          isEditing
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteServerM.mutate()} disabled={deleteServerM.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteServerM.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {server && (
        <Tabs defaultValue="overview" className="space-y-6">
          <ServerCapabilityTabsHeader serverId={serverId!} />

          <TabsContent value="overview">
            {isLoading ? (
              <Card><CardContent className="p-6"><div className="h-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" /></CardContent></Card>
            ) : (
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Server</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={5}>
                          <DropdownMenuItem onClick={() => refetch()} disabled={isRefetching}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} /> Refresh
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                            <Edit3 className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleServerM.mutate()} disabled={toggleServerM.isPending}>
                            {server?.instances?.some((i) => String(i.status).toLowerCase() === "ready" || String(i.status).toLowerCase() === "busy") ? (
                              <><Square className="mr-2 h-4 w-4" /> Stop</>
                            ) : (
                              <><Play className="mr-2 h-4 w-4" /> Start</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={(server as any)?.logo_url} alt={server?.name || serverId} />
                        <AvatarFallback>{(server?.name || serverId || "S").slice(0,1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-2 text-sm md:grid-cols-2 w-full">
                        <div className="leading-tight">Name: <span className="font-medium">{server.name}</span></div>
                        <div className="leading-tight">Type: <span className="font-mono">{server.kind}</span></div>
                        <div className="col-span-full flex items-center gap-2 leading-tight">Status: <StatusBadge status={server.status} instances={server.instances || []} /></div>
                        {server.command ? <div className="col-span-full leading-tight">Command: <span className="font-mono">{server.command}</span></div> : null}
                        <div className="col-span-full text-slate-500 flex items-center gap-1 leading-tight">
                          <LinkIcon className="h-3.5 w-3.5" />
                          <span>Repository:</span>
                          <span className="font-mono">—</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Instances ({server.instances?.length || 0})</CardTitle></CardHeader>
                  <CardContent>
                    {server.instances?.length ? (
                      <div className="space-y-2">
                        {server.instances.map((i) => (
                          <div
                            key={i.id}
                            className="rounded border p-3 text-sm flex items-center justify-between cursor-pointer hover:bg-accent/50"
                            onClick={() => navigate(`/servers/${encodeURIComponent(serverId!)}/instances/${encodeURIComponent(i.id)}`)}
                          >
                            <div className="font-mono">{i.id}</div>
                            <div className="text-xs text-slate-500">{String(i.status)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500">No instances.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tools">
            <ServerCapabilityList kind="tools" serverId={serverId!} />
          </TabsContent>
          <TabsContent value="resources">
            <ServerCapabilityList kind="resources" serverId={serverId!} />
          </TabsContent>
          <TabsContent value="prompts">
            <ServerCapabilityList kind="prompts" serverId={serverId!} />
          </TabsContent>
          <TabsContent value="templates">
            <ServerCapabilityList kind="templates" serverId={serverId!} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ServerCapabilityTabsHeader({ serverId }: { serverId: string }) {
  // Share queries for counts; child lists reuse same keys
  const toolsQ = useQuery({ queryKey: ["server-cap", "tools", serverId], queryFn: () => serversApi.listTools(serverId) });
  const resQ = useQuery({ queryKey: ["server-cap", "resources", serverId], queryFn: () => serversApi.listResources(serverId) });
  const prmQ = useQuery({ queryKey: ["server-cap", "prompts", serverId], queryFn: () => serversApi.listPrompts(serverId) });
  const tmpQ = useQuery({ queryKey: ["server-cap", "templates", serverId], queryFn: () => serversApi.listResourceTemplates(serverId) });

  return (
    <TabsList className="grid w-full grid-cols-5">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="tools">Tools ({toolsQ.data?.items?.length ?? 0})</TabsTrigger>
      <TabsTrigger value="resources">Resources ({resQ.data?.items?.length ?? 0})</TabsTrigger>
      <TabsTrigger value="prompts">Prompts ({prmQ.data?.items?.length ?? 0})</TabsTrigger>
      <TabsTrigger value="templates">Resource Templates ({tmpQ.data?.items?.length ?? 0})</TabsTrigger>
    </TabsList>
  );
}

function ServerCapabilityList({ kind, serverId }: { kind: "tools" | "resources" | "prompts" | "templates"; serverId: string }) {
  const [search, setSearch] = useState("");
  const [inspector, setInspector] = useState<{ open: boolean; kind: "tool"|"resource"|"prompt"; item: any } | null>(null);
  const queryMap = {
    tools: useQuery({ queryKey: ["server-cap", "tools", serverId], queryFn: () => serversApi.listTools(serverId) }),
    resources: useQuery({ queryKey: ["server-cap", "resources", serverId], queryFn: () => serversApi.listResources(serverId) }),
    prompts: useQuery({ queryKey: ["server-cap", "prompts", serverId], queryFn: () => serversApi.listPrompts(serverId) }),
    templates: useQuery({ queryKey: ["server-cap", "templates", serverId], queryFn: () => serversApi.listResourceTemplates(serverId) }),
  } as const;
  const q = queryMap[kind];
  const titleMap: Record<typeof kind, string> = {
    tools: "Tools",
    resources: "Resources",
    prompts: "Prompts",
    templates: "Resource Templates",
  } as any;

  return (
    <>
    <CapabilityList
      title={`${titleMap[kind]} (${q.data?.items?.length ?? 0})`}
      kind={kind as any}
      context="server"
      items={(q.data?.items as any[]) || []}
      loading={q.isLoading}
      filterText={search}
      onFilterTextChange={setSearch}
      emptyText={`No ${titleMap[kind].toLowerCase()} from this server`}
      renderAction={(m, item) => {
        if (kind === 'templates') return null;
        const btn = (
          <button
            className="text-xs rounded border px-2 py-1 hover:bg-accent inline-flex items-center gap-1"
            aria-label="Inspect"
            title="Inspect"
            onClick={() => setInspector({ open: true, kind: kind === 'tools' ? 'tool' : kind === 'prompts' ? 'prompt' : 'resource', item })}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Inspect</span>
          </button>
        );
        return btn;
      }}
    />
    {inspector && (
      <InspectorDrawer
        open={inspector.open}
        onOpenChange={(o) => setInspector(o ? inspector : null)}
        serverId={serverId}
        kind={inspector.kind}
        item={inspector.item}
      />
    )}
    </>
  );
}

export default ServerDetailPage;
