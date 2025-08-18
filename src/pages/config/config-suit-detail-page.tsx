import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { configSuitsApi } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useToast } from '../../components/ui/use-toast';
import { ArrowLeft, RefreshCw, Settings, Server, Wrench, FileText, Zap, Play, Square, Check, X, Edit3 } from 'lucide-react';
import { ConfigSuit, ConfigSuitServer, ConfigSuitTool, ConfigSuitResource, ConfigSuitPrompt } from '../../lib/types';

export function ConfigSuitDetailPage() {
  const { suitId } = useParams<{ suitId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  if (!suitId) {
    return <div>Config suit ID not provided</div>;
  }

  // Fetch config suit details
  const { 
    data: suit, 
    isLoading: isLoadingSuit, 
    refetch: refetchSuit,
    isRefetching: isRefetchingSuit 
  } = useQuery({
    queryKey: ['configSuit', suitId],
    queryFn: () => configSuitsApi.getSuit(suitId),
    retry: 1,
  });

  // Fetch servers in suit
  const { 
    data: serversResponse, 
    isLoading: isLoadingServers,
    refetch: refetchServers 
  } = useQuery({
    queryKey: ['configSuitServers', suitId],
    queryFn: () => configSuitsApi.getServers(suitId),
    retry: 1,
  });

  // Fetch tools in suit
  const { 
    data: toolsResponse, 
    isLoading: isLoadingTools,
    refetch: refetchTools 
  } = useQuery({
    queryKey: ['configSuitTools', suitId],
    queryFn: () => configSuitsApi.getTools(suitId),
    retry: 1,
  });

  // Fetch resources in suit
  const { 
    data: resourcesResponse, 
    isLoading: isLoadingResources,
    refetch: refetchResources 
  } = useQuery({
    queryKey: ['configSuitResources', suitId],
    queryFn: () => configSuitsApi.getResources(suitId),
    retry: 1,
  });

  // Fetch prompts in suit
  const { 
    data: promptsResponse, 
    isLoading: isLoadingPrompts,
    refetch: refetchPrompts 
  } = useQuery({
    queryKey: ['configSuitPrompts', suitId],
    queryFn: () => configSuitsApi.getPrompts(suitId),
    retry: 1,
  });

  // Activation/deactivation mutations
  const activateSuitMutation = useMutation({
    mutationFn: () => configSuitsApi.activateSuit(suitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configSuit', suitId] });
      queryClient.invalidateQueries({ queryKey: ['configSuits'] });
      toast({
        title: "Config Suit Activated",
        description: "Configuration suit has been successfully activated",
      });
    },
    onError: (error) => {
      toast({
        title: "Activation Failed",
        description: `Failed to activate config suit: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  const deactivateSuitMutation = useMutation({
    mutationFn: () => configSuitsApi.deactivateSuit(suitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configSuit', suitId] });
      queryClient.invalidateQueries({ queryKey: ['configSuits'] });
      toast({
        title: "Config Suit Deactivated",
        description: "Configuration suit has been successfully deactivated",
      });
    },
    onError: (error) => {
      toast({
        title: "Deactivation Failed",
        description: `Failed to deactivate config suit: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Server toggle mutations
  const serverToggleMutation = useMutation({
    mutationFn: ({ serverId, enable }: { serverId: string; enable: boolean }) => {
      return enable 
        ? configSuitsApi.enableServer(suitId, serverId)
        : configSuitsApi.disableServer(suitId, serverId);
    },
    onSuccess: () => {
      refetchServers();
      toast({
        title: "Server Updated",
        description: "Server status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Server Update Failed",
        description: `Failed to update server: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Tool toggle mutations
  const toolToggleMutation = useMutation({
    mutationFn: ({ toolId, enable }: { toolId: string; enable: boolean }) => {
      return enable 
        ? configSuitsApi.enableTool(suitId, toolId)
        : configSuitsApi.disableTool(suitId, toolId);
    },
    onSuccess: () => {
      refetchTools();
      toast({
        title: "Tool Updated",
        description: "Tool status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Tool Update Failed",
        description: `Failed to update tool: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Resource toggle mutations
  const resourceToggleMutation = useMutation({
    mutationFn: ({ resourceId, enable }: { resourceId: string; enable: boolean }) => {
      return enable 
        ? configSuitsApi.enableResource(suitId, resourceId)
        : configSuitsApi.disableResource(suitId, resourceId);
    },
    onSuccess: () => {
      refetchResources();
      toast({
        title: "Resource Updated",
        description: "Resource status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Resource Update Failed",
        description: `Failed to update resource: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  // Prompt toggle mutations
  const promptToggleMutation = useMutation({
    mutationFn: ({ promptId, enable }: { promptId: string; enable: boolean }) => {
      return enable 
        ? configSuitsApi.enablePrompt(suitId, promptId)
        : configSuitsApi.disablePrompt(suitId, promptId);
    },
    onSuccess: () => {
      refetchPrompts();
      toast({
        title: "Prompt Updated",
        description: "Prompt status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Prompt Update Failed",
        description: `Failed to update prompt: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });

  const handleSuitToggle = () => {
    if (suit?.is_active) {
      deactivateSuitMutation.mutate();
    } else {
      activateSuitMutation.mutate();
    }
  };

  const handleRefreshAll = () => {
    refetchSuit();
    refetchServers();
    refetchTools();
    refetchResources();
    refetchPrompts();
  };

  const servers = serversResponse?.servers || [];
  const tools = toolsResponse?.tools || [];
  const resources = resourcesResponse?.resources || [];
  const prompts = promptsResponse?.prompts || [];

  const enabledServers = servers.filter(s => s.enabled);
  const enabledTools = tools.filter(t => t.enabled);
  const enabledResources = resources.filter(r => r.enabled);
  const enabledPrompts = prompts.filter(p => p.enabled);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {suit && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold tracking-tight uppercase">{suit.name}</h2>
                  <Badge variant={suit.is_active ? "default" : "secondary"}>
                    {suit.suit_type}
                  </Badge>
                  {suit.is_active && (
                    <span className="flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <Check className="mr-1 h-3 w-3" />
                      Active
                    </span>
                  )}
                  {suit.is_default && (
                    <Badge variant="outline">Default</Badge>
                  )}
                </div>
                {suit.description && (
                  <p className="text-sm text-muted-foreground mt-1">{suit.description}</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRefreshAll}
            disabled={isRefetchingSuit}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetchingSuit ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {suit && (
            <>
              <Button
                variant="outline"
                size="sm"
              >
                <Edit3 className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                onClick={handleSuitToggle}
                disabled={activateSuitMutation.isPending || deactivateSuitMutation.isPending}
                variant={suit.is_active ? "destructive" : "default"}
                size="sm"
              >
                {suit.is_active ? (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Activate
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoadingSuit ? (
        <Card>
          <CardContent className="p-6">
            <div className="h-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
          </CardContent>
        </Card>
      ) : suit ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="servers">Servers ({servers.length})</TabsTrigger>
            <TabsTrigger value="tools">Tools ({tools.length})</TabsTrigger>
            <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>
            <TabsTrigger value="prompts">Prompts ({prompts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuration Suit Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-slate-500">Basic Information</h3>
                      <dl className="space-y-2">
                        <div className="flex justify-between">
                          <dt className="font-medium">Name:</dt>
                          <dd>{suit.name}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="font-medium">Type:</dt>
                          <dd>{suit.suit_type}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="font-medium">Status:</dt>
                          <dd>
                            <Badge variant={suit.is_active ? "default" : "secondary"}>
                              {suit.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="font-medium">Priority:</dt>
                          <dd>{suit.priority}</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-slate-500">Configuration</h3>
                      <dl className="space-y-2">
                        <div className="flex justify-between">
                          <dt className="font-medium">Multi-select:</dt>
                          <dd>{suit.multi_select ? "Yes" : "No"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="font-medium">Default:</dt>
                          <dd>{suit.is_default ? "Yes" : "No"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Servers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{enabledServers.length}/{servers.length}</div>
                    <p className="text-xs text-muted-foreground">enabled</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tools</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{enabledTools.length}/{tools.length}</div>
                    <p className="text-xs text-muted-foreground">enabled</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Resources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{enabledResources.length}/{resources.length}</div>
                    <p className="text-xs text-muted-foreground">enabled</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Prompts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{enabledPrompts.length}/{prompts.length}</div>
                    <p className="text-xs text-muted-foreground">enabled</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="servers">
            <Card>
              <CardHeader>
                <CardTitle>Servers</CardTitle>
                <CardDescription>
                  Manage servers included in this configuration suit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingServers ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                      </div>
                    ))}
                  </div>
                ) : servers.length > 0 ? (
                  <div className="space-y-4">
                    {servers.map((server) => (
                      <div key={server.id} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3">
                          <Server className="h-5 w-5 text-slate-500" />
                          <div>
                            <h3 className="font-medium">{server.name}</h3>
                            <p className="text-sm text-slate-500">ID: {server.id}</p>
                          </div>
                          {server.enabled && (
                            <Badge variant="default" className="ml-2">Enabled</Badge>
                          )}
                        </div>
                        <Switch
                          checked={server.enabled}
                          onCheckedChange={(enabled) => 
                            serverToggleMutation.mutate({ serverId: server.id, enable: enabled })
                          }
                          disabled={serverToggleMutation.isPending}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-8">No servers found in this configuration suit</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tools">
            <Card>
              <CardHeader>
                <CardTitle>Tools</CardTitle>
                <CardDescription>
                  Manage tools included in this configuration suit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTools ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                      </div>
                    ))}
                  </div>
                ) : tools.length > 0 ? (
                  <div className="space-y-4">
                    {tools.map((tool) => (
                      <div key={tool.id} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3">
                          <Wrench className="h-5 w-5 text-slate-500" />
                          <div>
                            <h3 className="font-medium">{tool.tool_name}</h3>
                            <p className="text-sm text-slate-500">
                              Server: {tool.server_name}
                              {tool.unique_name && ` • Unique: ${tool.unique_name}`}
                            </p>
                          </div>
                          {tool.enabled && (
                            <Badge variant="default" className="ml-2">Enabled</Badge>
                          )}
                        </div>
                        <Switch
                          checked={tool.enabled}
                          onCheckedChange={(enabled) => 
                            toolToggleMutation.mutate({ toolId: tool.id, enable: enabled })
                          }
                          disabled={toolToggleMutation.isPending}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-8">No tools found in this configuration suit</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resources">
            <Card>
              <CardHeader>
                <CardTitle>Resources</CardTitle>
                <CardDescription>
                  Manage resources included in this configuration suit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingResources ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                      </div>
                    ))}
                  </div>
                ) : resources.length > 0 ? (
                  <div className="space-y-4">
                    {resources.map((resource) => (
                      <div key={resource.id} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-500" />
                          <div>
                            <h3 className="font-medium">{resource.resource_uri}</h3>
                            <p className="text-sm text-slate-500">Server: {resource.server_name}</p>
                          </div>
                          {resource.enabled && (
                            <Badge variant="default" className="ml-2">Enabled</Badge>
                          )}
                        </div>
                        <Switch
                          checked={resource.enabled}
                          onCheckedChange={(enabled) => 
                            resourceToggleMutation.mutate({ resourceId: resource.id, enable: enabled })
                          }
                          disabled={resourceToggleMutation.isPending}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-8">No resources found in this configuration suit</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prompts">
            <Card>
              <CardHeader>
                <CardTitle>Prompts</CardTitle>
                <CardDescription>
                  Manage prompts included in this configuration suit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingPrompts ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800"></div>
                      </div>
                    ))}
                  </div>
                ) : prompts.length > 0 ? (
                  <div className="space-y-4">
                    {prompts.map((prompt) => (
                      <div key={prompt.id} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3">
                          <Zap className="h-5 w-5 text-slate-500" />
                          <div>
                            <h3 className="font-medium">{prompt.prompt_name}</h3>
                            <p className="text-sm text-slate-500">Server: {prompt.server_name}</p>
                          </div>
                          {prompt.enabled && (
                            <Badge variant="default" className="ml-2">Enabled</Badge>
                          )}
                        </div>
                        <Switch
                          checked={prompt.enabled}
                          onCheckedChange={(enabled) => 
                            promptToggleMutation.mutate({ promptId: prompt.id, enable: enabled })
                          }
                          disabled={promptToggleMutation.isPending}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-8">No prompts found in this configuration suit</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-slate-500">Configuration suit not found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}