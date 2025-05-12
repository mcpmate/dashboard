import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { serversApi } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Eye, RefreshCw } from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';

export function ServerListPage() {
  const { data: servers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['servers'],
    queryFn: serversApi.getAll,
    refetchInterval: 30000,
  });
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Servers</h2>
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
        ) : servers?.length ? (
          servers.map((server) => (
            <Card key={server.name} className="overflow-hidden">
              <CardHeader className="p-4">
                <CardTitle className="text-xl">{server.name}</CardTitle>
                <CardDescription>Type: {server.kind}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="mt-2 flex justify-between items-center">
                  <div className="flex flex-col">
                    <StatusBadge status={server.status} />
                    {server.instance_count > 0 && (
                      <span className="mt-1 text-xs text-slate-500">
                        {server.instance_count} instance{server.instance_count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <Link to={`/servers/${server.name}`}>
                    <Button size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full">
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-6">
                <p className="mb-2 text-center text-slate-500">No servers found</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}