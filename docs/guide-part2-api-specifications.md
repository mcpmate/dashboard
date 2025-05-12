# MCPMate 管理后台构建指南 - Part 2: API 端点规范

本文档详细说明了 MCPMate Proxy提供的 RESTful API 端点，管理后台将通过这些 API 与后端交互。

**重要提示**: 以下 API 规范中的请求体和响应体数据结构是基于现有文档和 RESTful 实践推断的。在实际开发中，请与后端开发团队确认具体的数据模型和字段。

## 3. API 端点详细规范

### 3.1 服务器管理 (`/api/mcp/servers/*`)

#### 3.1.1 列出所有服务器
- **端点**: `/api/mcp/servers`
- **方法**: `GET`
- **功能**: 获取所有已配置的 MCP 上游服务器的列表。
- **请求参数**: 无
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  [
    {
      "name": "string (server_name)",
      "kind": "string (stdio | sse | streamable_http)",
      "status": "string (connected | disconnected | error | initializing)",
      "instance_count": "integer",
      // ... 其他服务器摘要信息
    }
    // ... more servers
  ]
  ```
- **使用场景**: 在服务器管理页面展示所有服务器概览。

#### 3.1.2 获取特定服务器详情
- **端点**: `/api/mcp/servers/:name`
- **方法**: `GET`
- **功能**: 获取名为 `:name` 的特定服务器的详细配置和状态信息。
- **请求参数**: `:name` (路径参数, string) - 服务器名称。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "name": "string",
    "kind": "string",
    "command": "string (if applicable)",
    "commandPath": "string (optional)",
    "args": ["string"],
    "env": {"key": "value"},
    "status": "string",
    "instances": [
      {
        "id": "string (instance_id)",
        "status": "string (running | initializing | error | stopped)",
        // ... 其他实例摘要信息
      }
    ]
    // ... 其他详细信息
  }
  ```
- **使用场景**: 查看特定服务器的完整配置和其下所有实例的概览。

#### 3.1.3 列出特定服务器的所有实例
- **端点**: `/api/mcp/servers/:name/instances`
- **方法**: `GET`
- **功能**: 获取名为 `:name` 的服务器的所有运行实例列表。
- **请求参数**: `:name` (路径参数, string) - 服务器名称。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  [
    {
      "id": "string (instance_id)",
      "status": "string",
      "startTime": "timestamp",
      // ... 其他实例详细信息
    }
    // ... more instances
  ]
  ```
- **使用场景**: 在服务器详情页展示该服务器的所有实例。

#### 3.1.4 获取特定实例详情
- **端点**: `/api/mcp/servers/:name/instances/:id`
- **方法**: `GET`
- **功能**: 获取服务器 `:name` 下 ID 为 `:id` 的特定实例的详细信息。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "id": "string",
    "server_name": "string",
    "status": "string",
    "startTime": "timestamp",
    "health_status": "string (healthy | unhealthy | unknown)",
    // ... 其他实例详细信息和统计数据
  }
  ```
- **使用场景**: 查看特定实例的详细运行状态。

#### 3.1.5 检查实例健康状况
- **端点**: `/api/mcp/servers/:name/instances/:id/health`
- **方法**: `GET`
- **功能**: 检查服务器 `:name` 下 ID 为 `:id` 的实例的健康状况。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "instance_id": "string",
    "server_name": "string",
    "is_healthy": "boolean",
    "details": "string (optional, e.g., error message if unhealthy)"
  }
  ```
- **使用场景**: 主动查询实例健康状态，用于监控或故障排除。

#### 3.1.6 断开实例连接
- **端点**: `/api/mcp/servers/:name/instances/:id/disconnect`
- **方法**: `POST`
- **功能**: 正常断开服务器 `:name` 下 ID 为 `:id` 的实例的连接。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (disconnect_initiated | already_disconnected)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 用户手动停止某个实例。

#### 3.1.7 强制断开实例连接
- **端点**: `/api/mcp/servers/:name/instances/:id/disconnect/force`
- **方法**: `POST`
- **功能**: 强制断开服务器 `:name` 下 ID 为 `:id` 的实例的连接。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (force_disconnect_initiated | instance_not_found)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 当正常断开失败时，用户可以强制停止某个实例。

#### 3.1.8 重新连接实例
- **端点**: `/api/mcp/servers/:name/instances/:id/reconnect`
- **方法**: `POST`
- **功能**: 尝试重新连接服务器 `:name` 下 ID 为 `:id` 的已断开实例。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (reconnect_initiated | instance_not_found | already_connected)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 当实例意外断开后，用户尝试恢复连接。

#### 3.1.9 重置并重新连接实例
- **端点**: `/api/mcp/servers/:name/instances/:id/reconnect/reset`
- **方法**: `POST`
- **功能**: 重置服务器 `:name` 下 ID 为 `:id` 实例的状态并尝试重新连接。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (reset_and_reconnect_initiated | instance_not_found)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 用于解决实例连接的疑难杂症，相当于"重启"实例连接。

#### 3.1.10 取消初始化中的实例
- **端点**: `/api/mcp/servers/:name/instances/:id/cancel`
- **方法**: `POST`
- **功能**: 取消服务器 `:name` 下 ID 为 `:id` 的正在初始化过程中的实例。
- **请求参数**:
    - `:name` (路径参数, string) - 服务器名称。
    - `:id` (路径参数, string) - 实例 ID。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (cancel_initiated | instance_not_initializing | instance_not_found)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 当实例长时间卡在初始化状态时，用户可以取消该过程。

### 3.2 工具管理 (`/api/mcp/tools/*`)

#### 3.2.1 列出所有工具
- **端点**: `/api/mcp/tools`
- **方法**: `GET`
- **功能**: 获取所有已连接服务器聚合而来的工具列表。
- **请求参数**: 无
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  [
    {
      "tool_name": "string",
      "server_name": "string (source server)",
      "is_enabled": "boolean",
      "description": "string (optional)",
      // ... 其他工具摘要信息
    }
    // ... more tools
  ]
  ```
- **使用场景**: 在工具管理页面展示所有可用工具。

#### 3.2.2 获取特定工具配置
- **端点**: `/api/mcp/tools/:server_name/:tool_name`
- **方法**: `GET`
- **功能**: 获取源自 `:server_name` 的名为 `:tool_name` 的特定工具的详细配置信息。
- **请求参数**:
    - `:server_name` (路径参数, string) - 工具来源服务器名称。
    - `:tool_name` (路径参数, string) - 工具名称。
- **请求体**: 无
- **响应格式 (JSON)**: (具体结构依赖于工具的配置复杂度)
  ```json
  {
    "tool_name": "string",
    "server_name": "string",
    "is_enabled": "boolean",
    "description": "string (optional)",
    "configuration": {
      // ... 工具特定的配置项
    }
  }
  ```
- **使用场景**: 查看特定工具的详细配置。

#### 3.2.3 更新特定工具配置
- **端点**: `/api/mcp/tools/:server_name/:tool_name`
- **方法**: `POST` (或 `PUT`, 根据后端实现, `src/api/README.md` 标注为 POST)
- **功能**: 更新源自 `:server_name` 的名为 `:tool_name` 的特定工具的配置。
- **请求参数**:
    - `:server_name` (路径参数, string) - 工具来源服务器名称。
    - `:tool_name` (路径参数, string) - 工具名称。
- **请求体 (JSON)**: (具体结构依赖于工具的配置复杂度)
  ```json
  {
    "is_enabled": "boolean (optional)",
    "configuration": {
      // ... 要更新的工具特定配置项
    }
  }
  ```
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (updated | error)",
    "message": "string (optional)",
    "updated_tool": {
      // ... 更新后的工具信息 (可选)
    }
  }
  ```
- **使用场景**: 修改工具的配置参数，例如调整工具的行为。

#### 3.2.4 启用特定工具
- **端点**: `/api/mcp/tools/:server_name/:tool_name/enable`
- **方法**: `POST`
- **功能**: 启用源自 `:server_name` 的名为 `:tool_name` 的特定工具。
- **请求参数**:
    - `:server_name` (路径参数, string) - 工具来源服务器名称。
    - `:tool_name` (路径参数, string) - 工具名称。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (enabled | already_enabled | not_found | error)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 在工具列表中启用一个之前被禁用的工具。

#### 3.2.5 禁用特定工具
- **端点**: `/api/mcp/tools/:server_name/:tool_name/disable`
- **方法**: `POST`
- **功能**: 禁用源自 `:server_name` 的名为 `:tool_name` 的特定工具。
- **请求参数**:
    - `:server_name` (路径参数, string) - 工具来源服务器名称。
    - `:tool_name` (路径参数, string) - 工具名称。
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (disabled | already_disabled | not_found | error)",
    "message": "string (optional)"
  }
  ```
- **使用场景**: 在工具列表中禁用一个当前启用的工具。

### 3.3 通知管理 (`/api/notifications/*`)

#### 3.3.1 工具列表变更通知
- **端点**: `/api/notifications/tools/changed`
- **方法**: `POST` (通常此端点由后端触发, 客户端通过 WebSocket 或其他机制订阅此类通知, 而非主动调用)
- **功能**: 通知客户端 MCPMate Proxy 聚合的工具列表已发生变化。
- **请求体 (JSON)**: (可能为空, 或包含变更的摘要信息)
  ```json
  {
    "event": "tools_list_changed",
    // ... 其他可选的变更详情
  }
  ```
- **响应格式 (JSON)**: (通常为 2xx 状态码表示接收成功)
  ```json
  {
    "status": "string (acknowledged)"
  }
  ```
- **使用场景**: 后端在工具集发生变化 (如新服务器连接、服务器断开、工具启用/禁用) 时调用此端点 (或通过 WebSocket 发送类似消息), 前端收到通知后应刷新工具列表。

### 3.4 系统管理 (`/api/system/*`)

#### 3.4.1 获取系统状态
- **端点**: `/api/system/status`
- **方法**: `GET`
- **功能**: 获取 MCPMate Proxy 服务的整体运行状态。
- **请求参数**: 无
- **请求体**: 无
- **响应格式 (JSON)**:
  ```json
  {
    "status": "string (running | degraded | stopped | error)",
    "version": "string (MCPMate Proxy version)",
    "uptime": "integer (seconds)",
    "active_mcp_servers": "integer",
    "aggregated_tools_count": "integer",
    // ... 其他系统状态信息
  }
  ```
- **使用场景**: 在管理后台的仪表盘或状态栏显示系统当前运行状态。

#### 3.4.2 获取系统指标
- **端点**: `/api/system/metrics`
- **方法**: `GET`
- **功能**: 获取 MCPMate Proxy 服务的性能指标。
- **请求参数**: 无
- **请求体**: 无
- **响应格式 (JSON / Prometheus format)**: (具体格式可能为 JSON 或 Prometheus exposition format)
  ```json
  // Example JSON format
  {
    "cpu_usage_percent": "float",
    "memory_usage_bytes": "integer",
    "active_connections": "integer",
    "total_requests_mcp": "integer",
    "error_rate_mcp": "float",
    // ... 其他性能指标
  }
  ```
- **使用场景**: 用于监控系统性能, 展示历史趋势图表等。

---

接下来的部分将详细介绍用户界面设计要求、技术栈和开发建议。