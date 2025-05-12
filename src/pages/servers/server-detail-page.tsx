import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { serversApi } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft, RefreshCw, Monitor, PlayCircle, StopCircle, RotateCw, XCircle } from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import { formatRelativeTime } from '../../lib/utils';

export function ServerDetailPage() {
  const { serverName } = useParams<{ serverName: string }>();
  
  const { data: server, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['server', serverName],
    queryFn: () => serversApi.getServer(serverName || ''),
    enabled: !!serverName,
    refetchInterval: 15000,
  });
  
  if (!serverName) {
    return <div>Server name not provided</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/servers">
            <Button variant="ghost" size="sm" className="mr-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Servers
            </Button>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">{serverName}</h2>
          {!isLoading && server && <StatusBadge status={server.status} className="ml-3" />}
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
                      <dd><StatusBadge status={server.status} /></dd>
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
                          <StatusBadge status={instance.status} />
                        </div>
                        {instance.startTime && (
                          <CardDescription>
                            Started {formatRelativeTime(instance.startTime)}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link to={`/servers/${serverName}/instances/${instance.id}`}>
                            <Button size="sm" variant="outline">
                              <Monitor className="mr-2 h-4 w-4" />
                              Details
                            </Button>
                          </Link>
                          
                          {instance.status === 'initializing' ? (
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => {
                                serversApi.cancelInstance(serverName, instance.id)
                                  .then(() => refetch());
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancel
                            </Button>
                          ) : instance.status === 'running' ? (
                            <Button 
                              size="sm" 
                              variant="secondary"
                              onClick={() => {
                                serversApi.disconnectInstance(serverName, instance.id)
                                  .then(() => refetch());
                              }}
                            >
                              <StopCircle className="mr-2 h-4 w-4" />
                              Disconnect
                            </Button>
                          ) : (
                            <>
                              <Button 
                                size="sm" 
                                variant="secondary"
                                onClick={() => {
                                  serversApi.reconnectInstance(serverName, instance.id)
                                    .then(() => refetch());
                                }}
                              >
                                <PlayCircle className="mr-2 h-4 w-4" />
                                Reconnect
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  serversApi.resetAndReconnectInstance(serverName, instance.id)
                                    .then(() => refetch());
                                }}
                              >
                                <RotateCw className="mr-2 h-4 w-4" />
                                Reset & Reconnect
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500">No instances available for this server.</p>
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