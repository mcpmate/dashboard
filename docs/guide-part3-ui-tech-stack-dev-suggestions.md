# MCPMate 管理后台构建指南 - Part 3: UI 设计、技术栈与开发建议

本文档的最后一部分将概述 MCPMate 管理后台的用户界面 (UI) 设计要求、指定的技术栈以及一些前端开发建议。

## 4. 用户界面 (UI) 设计要求

管理后台的 UI 设计应以用户友好、信息直观、操作高效为目标。

### 4.1 操作模式

需要实现两种主要的操作模式，以适应不同经验水平的用户：

**a) 向导模式 (Wizard Mode)**
- **目标用户**: 新用户或不熟悉 MCP 配置的用户。
- **目的**: 提供逐步引导的配置流程，简化复杂设置，帮助用户快速上手并完成基本配置。
- **特点**:
    - 分步表单，每一步都有清晰的说明和提示。
    - 隐藏高级或不常用的选项，提供合理的默认值。
    - 流程化的引导，例如：添加第一个 MCP 服务器 -> 查看其工具 -> 了解系统状态。
    - 在关键步骤提供上下文帮助和解释。

**b) 专家模式 (Expert Mode)**
- **目标用户**: 高级用户、熟悉 MCP 协议和服务器配置的开发者。
- **目的**: 提供全面的配置选项和高级功能访问，允许用户进行精细化控制和管理。
- **特点**:
    - 所有配置项和功能均可见且可操作。
    - 提供批量操作、高级过滤和排序功能。
    - 更详细的日志和监控数据视图。
    - 可能包括直接编辑 JSON 配置（如果后端支持）或导入/导出配置的功能。

**模式切换**: 应提供明显的切换机制，允许用户在两种模式间方便地切换。

### 4.2 界面信息展示

界面需要直观地展示关键信息：

- **服务器状态**: 清晰显示每个 MCP 服务器的连接状态（如：在线、离线、错误、实例数）、类型等。使用颜色编码（如绿色表示正常，红色表示错误）增强可读性。
- **工具可用性**: 明确展示聚合工具列表及其启用/禁用状态，以及工具来源服务器。
- **系统监控信息**: 在仪表盘或专门的监控页面展示 MCPMate Proxy 的核心指标，如 CPU/内存使用率、活动连接数、API 请求统计等。可以使用图表（如折线图、仪表盘组件）进行可视化。

### 4.3 交互与反馈

- **清晰的错误提示**: 当操作失败或发生错误时，提供明确、易懂的错误信息，并尽可能给出解决方案或排查建议。
- **操作反馈机制**: 对用户的操作（如点击按钮、保存配置）给予即时反馈（如加载指示器、成功/失败通知）。
- **一致性**: 整体界面风格、控件使用、交互模式应保持一致。

## 5. 技术栈要求

前端开发需遵循以下技术栈：

- **前端框架**: **Next.js 14.x** (App Router 优先)
- **UI 组件库**: **shadcn/UI**。利用其提供的组件构建界面，确保设计语言的一致性和现代化观感。
- **响应式设计**: 确保应用在不同尺寸的设备（桌面、平板）上都有良好的显示效果和用户体验。
- **实时数据更新**: 对于服务器状态、工具列表、系统指标等动态数据，应实现实时或近实时更新。可以考虑使用以下技术：
    - **WebSocket**: 用于从后端接收实时通知 (如 `notifications/tools/changed`)。
    - **定期轮询 (Polling)**: 对于某些非关键但需要更新的数据，可以采用短轮询或长轮询机制调用 API 获取最新状态。
    - **Server-Sent Events (SSE)**: 如果后端 API 支持，也可用于单向实时数据流。

## 6. 开发建议

### 6.1 前端代码结构

建议采用模块化、功能驱动的目录结构，以便更好地匹配 MCPMate 的后端架构和功能模块。

一个可能的结构示例 (使用 Next.js App Router):

```
app/
  ├── (dashboard)/                # Authenticated routes / Main layout
  │   ├── layout.tsx
  │   ├── page.tsx                # Main dashboard overview
  │   ├── servers/
  │   │   ├── page.tsx            # Server list view
  │   │   ├── [serverName]/
  │   │   │   ├── page.tsx        # Specific server detail view
  │   │   │   ├── instances/
  │   │   │   │   ├── page.tsx    # Instance list for a server
  │   │   │   │   └── [instanceId]/page.tsx # Specific instance detail
  │   │   │   └── components/     # Server-specific UI components
  │   ├── tools/
  │   │   ├── page.tsx            # Aggregated tools list view
  │   │   ├── [serverName]/[toolName]/page.tsx # Specific tool detail (if needed)
  │   │   └── components/         # Tool-specific UI components
  │   ├── system/
  │   │   ├── page.tsx            # System status and metrics view
  │   │   └── components/         # System-specific UI components
  │   └── settings/               # Application settings, expert/wizard mode toggle
  │       └── page.tsx
  ├── (auth)/                     # Authentication routes (login, etc.)
  │   └── ...
  ├── api/                        # Next.js API routes (if any client-side proxying needed)
  │   └── ...
  ├── components/                 # Shared UI components (using shadcn/UI)
  │   ├── layout/
  │   └── common/
  ├── lib/                        # Utility functions, API client, type definitions
  │   ├── api.ts                  # Centralized API call functions
  │   ├── utils.ts
  │   └── types.ts                # TypeScript type definitions for API & data
  ├── contexts/                   # React Context for global state (if needed)
  ├── hooks/                      # Custom React hooks
  └── styles/
      └── globals.css
```

### 6.2 关键页面和组件的推荐实现方式

- **仪表盘 (`app/(dashboard)/page.tsx`)**: 汇总展示系统状态、服务器概览、工具概览等关键信息。使用 `shadcn/UI` 的 Card, Progress, Badge 等组件。
- **服务器列表 (`app/(dashboard)/servers/page.tsx`)**: 使用 `shadcn/UI` 的 Table 组件展示服务器，支持排序和过滤。每行应有操作按钮（查看详情、管理实例等）。
- **服务器详情 (`app/(dashboard)/servers/[serverName]/page.tsx`)**: 展示服务器配置信息、实例列表。实例列表也可用 Table 组件。
- **工具列表 (`app/(dashboard)/tools/page.tsx`)**: 使用 Table 或 Card 列表展示工具，提供启用/禁用开关 (`shadcn/UI` Switch)。
- **状态指示器**: 广泛使用 Badge 或自定义状态点（带颜色）来表示服务器、实例、工具的状态。
- **向导/专家模式切换**: 可以在用户设置或应用顶栏提供一个明显的切换开关。

### 6.3 数据获取和状态管理

- **数据获取**:
    - 推荐使用 React Query (`@tanstack/react-query`) 或 SWR 进行 API 数据获取、缓存、自动刷新和状态同步。它们能很好地处理加载状态、错误状态，并简化实时数据更新的实现。
    - 在 `lib/api.ts` 中封装所有与后端 API 的交互逻辑，使其易于管理和测试。
- **状态管理**:
    - 对于全局状态（如用户认证信息、当前操作模式 - 向导/专家），可以使用 React Context API 或 Zustand/Jotai 等轻量级状态管理库。
    - 对于组件局部状态，优先使用 React 内置的 `useState` 和 `useReducer`。
    - 尽量将状态提升到最近的共同祖先组件，避免不必要的 Prop Drilling。
- **类型安全**: 全面使用 TypeScript，为 API 响应、请求体和所有关键数据结构定义明确的类型 (`lib/types.ts`)，以提高代码健壮性和开发效率。

### 6.4 实时更新策略

- **WebSocket for Notifications**: 建立 WebSocket 连接监听后端 `/api/notifications/tools/changed` 等事件。收到事件后，可以触发 React Query/SWR 对相关数据进行重新获取 (refetch)。
- **Polling for Status**: 对于服务器健康状态、系统指标等，可以配置 React Query/SWR 的 `refetchInterval` 实现定期轮询刷新。
- **Optimistic Updates**: 对于用户操作（如启用/禁用工具），可以考虑使用 Optimistic Updates 提升用户体验，即先在 UI 上反映变化，然后发送 API 请求，如果失败则回滚。

---

本指南提供了构建 MCPMate 管理后台的初步需求和建议。在开发过程中，请与 MCPMate 后端团队保持密切沟通，以获取最新的 API 细节和澄清任何疑问。