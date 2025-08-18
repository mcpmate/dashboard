import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Monitor, PlayCircle, RefreshCw, RotateCw, StopCircle, XCircle, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../components/status-badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { useToast } from '../../components/ui/use-toast';
import { serversApi } from '../../lib/api';
import { formatRelativeTime } from '../../lib/utils';

export function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: server, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => serversApi.getServer(serverId || ''),
    enabled: !!serverId,
    refetchInterval: 15000,
  });

  // Instance operation mutation
  const instanceMutation = useMutation({
    mutationFn: async ({
      action,
      instanceId
    }: {
      action: 'disconnect' | 'reconnect' | 'reset' | 'cancel';
      instanceId: string;
    }) => {
      if (!serverId) throw new Error('Server ID is required');

      switch (action) {
        case 'disconnect':
          return await serversApi.disconnectInstance(serverId, instanceId);
        case 'reconnect':
          return await serversApi.reconnectInstance(serverId, instanceId);
        case 'reset':
          return await serversApi.resetAndReconnectInstance(serverId, instanceId);
        case 'cancel':
          return await serversApi.cancelInstance(serverId, instanceId);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
    onSuccess: (_, variables) => {
      const actionMap = {
        disconnect: 'Disconnected',
        reconnect: 'Reconnected',
        reset: 'Reset and reconnected',
        cancel: 'Canceled',
      };

      toast({
        title: `Instance ${actionMap[variables.action]}`,
        description: `Instance ${variables.instanceId.substring(0, 8)}... was ${actionMap[variables.action].toLowerCase()} successfully`,
      });

      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
    },
    onError: (error, variables) => {
      toast({
        title: 'Operation Failed',
        description: `Unable to ${variables.action === 'disconnect' ? 'disconnect' :
          variables.action === 'reconnect' ? 'reconnect' :
            variables.action === 'reset' ? 'reset' : 'cancel'} instance: ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    },
  });

  // Handle instance action
  const handleInstanceAction = (action: 'disconnect' | 'reconnect' | 'reset' | 'cancel', instanceId: string) => {
    instanceMutation.mutate({ action, instanceId });
  };

  if (!serverId) {
    return <div>No server ID provided</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/servers">
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Server List
            </Button>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">{server?.name || serverId}</h2>
          {!isLoading && server && (
            <StatusBadge
              status={
                typeof server.status === 'string'
                  ? server.status.toLowerCase()
                  : 'unknown'
              }
              instances={server.instances.map(instance => ({
                ...instance,
                status: typeof instance.status === 'string'
                  ? instance.status.toLowerCase()
                  : 'unknown'
              }))}
              className="ml-3"
              blinkOnError={true}
            />
          )}
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
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
          </CardContent>
        </Card>
      ) : server ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Server Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-500">Basic Information</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="font-medium">Name:</dt>
                      <dd>{server.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium">Type:</dt>
                      <dd>{server.kind}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium">Status:</dt>
                      <dd>
                        <StatusBadge
                          status={server.status}
                          instances={server.instances}
                          blinkOnError={true}
                        />
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium">Active Instances:</dt>
                      <dd>{server.instances.length}</dd>
                    </div>
                  </dl>
                </div>

                {server.command && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-slate-500">Command Configuration</h3>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="font-medium">Command:</dt>
                        <dd className="font-mono text-sm">{server.command}</dd>
                      </div>
                      {server.commandPath && (
                        <div className="flex justify-between">
                          <dt className="font-medium">Path:</dt>
                          <dd className="font-mono text-sm">{server.commandPath}</dd>
                        </div>
                      )}
                      {server.args && server.args.length > 0 && (
                        <div className="flex justify-between">
                          <dt className="font-medium">Arguments:</dt>
                          <dd className="font-mono text-sm">{server.args.join(' ')}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instances ({server.instances.length})</CardTitle>
              <CardDescription>
                List of all instances for this server
              </CardDescription>
            </CardHeader>
            <CardContent>
              {server.instances.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {server.instances.map((instance) => (
                    <Card key={instance.id} className="overflow-hidden">
                      <CardHeader className="p-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium truncate" title={instance.id}>
                            {instance.id.substring(0, 8)}...
                          </CardTitle>
                          <StatusBadge
                            status={
                              typeof instance.status === 'string'
                                ? instance.status.toLowerCase()
                                : 'unknown'
                            }
                            blinkOnError={
                              typeof instance.status === 'string' &&
                              instance.status.toLowerCase() === 'error'
                            }
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="space-y-3">
                          <div>
                            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                              <span>Status:</span>
                              <span>
                                {instance.status}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                              <span>ID:</span>
                              <span className="font-mono">
                                {instance.id.substring(0, 12)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 mt-4">
                            {/* Action buttons */}
                            <div className="flex justify-between gap-2">
                              <Link to={`/servers/${serverId}/instances/${instance.id}`} className="flex-1">
                                <Button variant="outline" size="sm" className="w-full">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Details
                                </Button>
                              </Link>

                              {instance.status.toLowerCase() === 'ready' || instance.status.toLowerCase() === 'busy' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleInstanceAction('disconnect', instance.id)}
                                  disabled={instanceMutation.isPending}
                                  className="flex-1"
                                >
                                  <StopCircle className="mr-2 h-4 w-4" />
                                  Disconnect
                                </Button>
                              ) : null}
                            </div>

                            {/* Reconnect button - shown for error or shutdown states */}
                            {instance.status.toLowerCase() === 'error' || instance.status.toLowerCase() === 'shutdown' ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleInstanceAction('reconnect', instance.id)}
                                disabled={instanceMutation.isPending}
                                className="w-full"
                              >
                                <PlayCircle className="mr-2 h-4 w-4" />
                                Reconnect
                              </Button>
                            ) : null}

                            {/* Cancel button - shown for initializing state */}
                            {instance.status.toLowerCase() === 'initializing' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleInstanceAction('cancel', instance.id)}
                                disabled={instanceMutation.isPending}
                                className="w-full"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500">This server has no available instances.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-slate-500">Server not found or error loading server details.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}