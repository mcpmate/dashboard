import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Edit, Eye, Plus, Power, PowerOff, RefreshCw, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { ErrorDisplay } from '../../components/error-display';
import { ServerForm } from '../../components/server-form';
import { StatusBadge } from '../../components/status-badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { useToast } from '../../components/ui/use-toast';
import { serversApi } from '../../lib/api';
import { MCPServerConfig, ServerDetail, ServerListResponse, ServerSummary } from '../../lib/types';

// Helper function to determine if a server is active
function isServerActive(server: ServerSummary): boolean {
  // Check server status first
  const serverStatus = (server.status || '').toLowerCase();
  if (['connected', 'running', 'ready', 'healthy', 'busy', 'active', 'thinking', 'fetch'].includes(serverStatus)) {
    return true;
  }

  // If server has instances, check if any instance is active
  if (server.instances && server.instances.length > 0) {
    return server.instances.some(instance => {
      const instanceStatus = (instance.status || '').toLowerCase();
      return ['ready', 'busy', 'running', 'connected', 'active', 'healthy', 'thinking', 'fetch'].includes(instanceStatus);
    });
  }

  // Otherwise, consider the server inactive
  return false;
}

// Helper function to get the instance count for a server
function getInstanceCount(server: ServerSummary): number {
  // If server has instances array, use its length
  if (server.instances && Array.isArray(server.instances)) {
    return server.instances.length;
  }

  // If server has instance_count property, use it
  if (typeof server.instance_count === 'number') {
    return server.instance_count;
  }

  // Default to 0 if no instance information is available
  return 0;
}

export function ServerListPage() {
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerDetail | null>(null);
  const [deletingServer, setDeletingServer] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [syncToAllClients, setSyncToAllClients] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: serverListResponse,
    isLoading,
    refetch,
    isRefetching,
    error,
    isError
  } = useQuery<ServerListResponse>({
    queryKey: ['servers'],
    queryFn: async () => {
      try {
        // Add debug information
        console.log('Fetching servers...');
        const result = await serversApi.getAll();
        console.log('Servers fetched:', result);
        return result;
      } catch (err) {
        console.error('Error fetching servers:', err);
        // Capture error information for display
        setDebugInfo(
          err instanceof Error
            ? `${err.message}\n\n${err.stack}`
            : String(err)
        );
        throw err;
      }
    },
    refetchInterval: 30000,
    retry: 1, // Reduce retry count to show errors more quickly
  });

  // Server details query
  const getServerDetails = async (serverId: string) => {
    try {
      return await serversApi.getServer(serverId);
    } catch (error) {
      console.error(`Error fetching server details for ${serverId}:`, error);
      return null;
    }
  };

  // Enable/disable server
  const toggleServerMutation = useMutation({
    mutationFn: async ({ serverId, enable, sync }: { serverId: string; enable: boolean; sync?: boolean }) => {
      if (enable) {
        return await serversApi.enableServer(serverId, sync);
      } else {
        return await serversApi.disableServer(serverId, sync);
      }
    },
    onSuccess: (_, variables) => {
      // Immediate invalidation
      queryClient.invalidateQueries({ queryKey: ['servers'] });

      toast({
        title: variables.enable ? "Server Enabled" : "Server Disabled",
        description: `Server ${variables.serverId} ${variables.enable ? "has been successfully enabled" : "has been successfully disabled"}`,
      });

      // Delayed refetch to ensure we get the latest state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['servers'] });
      }, 1000);
    },
    onError: (error, variables) => {
      toast({
        title: "Operation Failed",
        description: `Unable to ${variables.enable ? "enable" : "disable"} server: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Note: Reconnect functionality is moved to instance-level pages

  // Create server
  const createServerMutation = useMutation({
    mutationFn: async (serverConfig: Partial<MCPServerConfig>) => {
      return await serversApi.createServer(serverConfig);
    },
    onSuccess: () => {
      toast({
        title: "Server Created",
        description: "New server has been successfully created",
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: `Unable to create server: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Update server
  const updateServerMutation = useMutation({
    mutationFn: async ({ serverId, config }: { serverId: string; config: Partial<MCPServerConfig> }) => {
      return await serversApi.updateServer(serverId, config);
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Server Updated",
        description: `Server ${variables.serverId} has been successfully updated`,
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
    onError: (error, variables) => {
      toast({
        title: "Update Failed",
        description: `Unable to update server ${variables.serverId}: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Handle add server
  const handleAddServer = async (serverConfig: Partial<MCPServerConfig>) => {
    await createServerMutation.mutateAsync(serverConfig);
    setIsAddServerOpen(false);
  };

  // Handle edit server
  const handleEditServer = async (serverId: string) => {
    const serverDetails = await getServerDetails(serverId);
    if (serverDetails) {
      setEditingServer(serverDetails);
    } else {
      toast({
        title: "Failed to get server details",
        description: `Unable to get details for server ${serverId}`,
        variant: "destructive",
      });
    }
  };

  // Handle update server
  const handleUpdateServer = async (config: Partial<MCPServerConfig>) => {
    if (editingServer) {
      await updateServerMutation.mutateAsync({
        serverId: editingServer.id,
        config,
      });
      setEditingServer(null);
    }
  };

  // Convert ServerDetail to MCPServerConfig for form
  const convertToMCPConfig = (server: ServerDetail): Partial<MCPServerConfig> => {
    return {
      name: server.name,
      kind: (server.server_type || server.kind) as "stdio" | "sse" | "streamable_http",
      command: server.command,
      args: server.args,
      env: server.env
    };
  };

  // Handle delete server
  const handleDeleteServer = async () => {
    if (!deletingServer) return;

    setIsDeleteLoading(true);
    setDeleteError(null);

    try {
      await serversApi.deleteServer(deletingServer);
      toast({
        title: "Server Deleted",
        description: `Server ${deletingServer} has been successfully deleted`,
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setIsDeleteConfirmOpen(false);
      setDeletingServer(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Error deleting server");
    } finally {
      setIsDeleteLoading(false);
    }
  };

  // Add debug button handler
  const toggleDebugInfo = () => {
    if (debugInfo) {
      setDebugInfo(null);
    } else {
      setDebugInfo(
        `API Base URL: ${window.location.origin}\n` +
        `Current Time: ${new Date().toISOString()}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}\n` +
        `Servers Data: ${JSON.stringify(serverListResponse, null, 2)}`
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Servers</h2>
        <div className="flex gap-2 items-center">
          {isError && (
            <Button
              onClick={toggleDebugInfo}
              variant="outline"
              size="sm"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              {debugInfo ? "Hide Debug" : "Debug"}
            </Button>
          )}

          {/* Sync to all clients toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="sync-toggle"
              checked={syncToAllClients}
              onCheckedChange={setSyncToAllClients}
            />
            <Label htmlFor="sync-toggle" className="text-sm font-medium">
              Sync to all clients
            </Label>
          </div>

          <Button
            onClick={() => refetch()}
            disabled={isRefetching}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsAddServerOpen(true)}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Display error information */}
      {isError && (
        <ErrorDisplay
          title="Failed to load servers"
          error={error as Error}
          onRetry={() => refetch()}
        />
      )}

      {/* Display debug information */}
      {debugInfo && (
        <Card className="overflow-hidden">
          <CardHeader className="bg-slate-100 dark:bg-slate-800 p-4">
            <CardTitle className="text-lg flex justify-between">
              Debug Information
              <Button
                onClick={() => setDebugInfo(null)}
                variant="ghost"
                size="sm"
              >
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-96">
              {debugInfo}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="p-4">
                <div className="h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="mt-2 flex justify-between">
                  <div className="h-5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                  <div className="h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : serverListResponse?.servers?.length ? (
          serverListResponse.servers.map((server) => (
            <Card key={server.id} className="overflow-hidden">
              <CardHeader className="p-4 flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-xl">{server.name}</CardTitle>
                  <CardDescription className="flex flex-col mt-1 space-y-1">
                    <span>Type: {server.server_type || server.kind || 'Unknown'}</span>
                    <span>
                      Instances: {getInstanceCount(server)}
                    </span>
                    {server.enabled !== undefined && (
                      <span>
                        Status: {server.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    )}
                  </CardDescription>
                </div>
                {/* 状态徽章放在右上角 */}
                <StatusBadge
                  status={server.status}
                  instances={server.instances}
                  blinkOnError={['error', 'unhealthy', 'stopped', 'failed'].includes((server.status || '').toLowerCase())}
                />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  {/* 操作按钮和详情按钮布局 */}
                  <div className="flex justify-between items-center mt-4">
                    {/* 左侧操作按钮 */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleServerMutation.mutate({
                          serverId: server.id,
                          enable: !isServerActive(server),
                          sync: syncToAllClients
                        })}
                        disabled={toggleServerMutation.isPending}
                        title={isServerActive(server) ? "Disable Server" : "Enable Server"}
                      >
                        {isServerActive(server) ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>



                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditServer(server.id)}
                        title="Edit server configuration"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeletingServer(server.id);
                          setIsDeleteConfirmOpen(true);
                        }}
                        title="Delete server"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* 右侧详情按钮 */}
                    <Link to={`/servers/${server.id}`}>
                      <Button size="sm">
                        <Eye className="mr-2 h-4 w-4" />
                        Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full">
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-6">
                <p className="mb-2 text-center text-slate-500">
                  {isError
                    ? "Failed to load servers, please check the error message above."
                    : "No servers found. Please ensure the backend service is running and servers are configured."}
                </p>
                <Button
                  onClick={() => setIsAddServerOpen(true)}
                  size="sm"
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Server
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add server form */}
      <ServerForm
        isOpen={isAddServerOpen}
        onClose={() => setIsAddServerOpen(false)}
        onSubmit={handleAddServer}
        title="Add Server"
        submitLabel="Create"
      />

      {/* Edit server form */}
      {editingServer && (
        <ServerForm
          isOpen={!!editingServer}
          onClose={() => setEditingServer(null)}
          onSubmit={handleUpdateServer}
          initialData={convertToMCPConfig(editingServer)}
          title={`Edit Server: ${editingServer.name}`}
          submitLabel="Update"
        />
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteServer}
        title="Delete Server"
        description={`Are you sure you want to delete the server "${deletingServer}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={isDeleteLoading}
        error={deleteError}
      />
    </div>
  );
}