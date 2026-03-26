# Portable Memory System + Codex Skill Design

## 1. 问题定义

当前 `codex-memory-mcp` 已具备基础记忆能力：

- 通过 MCP 暴露 `memory_store`、`memory_recall`、`memory_update`、`memory_forget`
- 使用 LanceDB 持久化向量和文本索引
- 支持 hybrid recall
- 已有 `global`、`project:*`、`user:*`、`agent:*` 等 scope 约定

但它仍缺少一套真正可移植、可治理、可被 agent 稳定调用的 memory 体系。当前主要问题：

- 只有底层存储能力，没有“何时记录、记录什么、怎么分层检索”的上层策略
- 缺少导出/导入与 profile 机制，跨机器迁移成本高
- 缺少记忆治理能力，旧决策、重复记忆、临时会话噪声容易堆积
- 没有 Codex skill 将 recall/store 的使用方式固定为可复用工作流

目标不是再做一个“向量数据库封装”，而是建立一套可以在不同项目、不同机器、不同 Codex 会话间复用的记忆系统。

## 2. 设计目标

本设计的目标如下：

1. 构建一个 `hybrid memory model`，同时支持项目级记忆和全局级记忆。
2. 保持底层系统独立运行，避免 skill 与存储层耦合。
3. 为 Codex 提供稳定的“先 recall、后执行、再沉淀”的工作流。
4. 支持可移植迁移，至少覆盖数据库导出/导入和配置迁移。
5. 支持基础治理能力，包括 supersede、去重、低价值清理和记忆压缩。
6. 以现有 `codex-memory-mcp` 为基础演进，避免推倒重来。

非目标：

- 不在首版引入 Web UI。
- 不在首版引入复杂权限系统或多租户服务端。
- 不在首版追求跨云同步或远程托管。
- 不在首版实现完全自动化的长期记忆抽取，先以显式工具调用和 skill workflow 为主。

## 3. 方案概览

采用三层结构：

1. `Portable Memory Core`
   由 `codex-memory-mcp` 提供，负责存储、检索、导入导出、压缩治理。
2. `Memory Profile`
   提供项目身份、默认 scope、检索优先级、自动记忆规则等配置。
3. `Codex Skill`
   负责定义在实际任务中如何使用 memory，包括 recall 时机、写入原则、摘要沉淀规则。

推荐记忆边界采用 `hybrid`：

- `project:<project-id>`：保存当前项目约定、技术决策、待续上下文、代码风格偏好
- `global`：保存跨项目稳定偏好、长期工作习惯、通用工程规则

默认检索优先级：

1. `project:<project-id>`
2. `global`

该顺序保证项目内部决策优先于全局习惯，减少错误召回。

## 4. 架构设计

### 4.1 现有组件复用

现有核心文件可直接复用：

- `src/server.ts`
- `src/memory-service.ts`
- `src/core/store.ts`
- `src/core/scopes.ts`

设计上保留当前 MCP server 与 store 结构，不替换 LanceDB，不改动当前基础 recall/store 逻辑的职责边界。

### 4.2 新增模块

建议新增以下模块：

- `src/core/profile.ts`
  - 负责加载与解析 memory profile
  - 计算当前项目 ID、默认 scope、检索 scope 顺序
- `src/core/memory-kinds.ts`
  - 定义 episodic / semantic 等稳定类型
- `src/core/memory-ranking.ts`
  - 统一融合 `score + importance + recency + stability`
- `src/core/export-import.ts`
  - 导出 `jsonl`
  - 导入 `jsonl`
- `src/core/compaction.ts`
  - 去重、标记 superseded、清理低价值记忆

Codex skill 独立存放于技能目录，调用 MCP 工具，不直接嵌入 `codex-memory-mcp` 仓库逻辑。

## 5. 数据模型

### 5.1 Memory 类型分层

新增两个逻辑层级：

- `episodic`
  - 会话临时上下文、进行中的任务事实、短期决策
- `semantic`
  - 长期有效的偏好、稳定规则、被确认的项目约定

这两个层级不替代当前 `category`，而是与 `category` 正交存在：

- `category` 继续表达内容类型
  - `preference`
  - `fact`
  - `decision`
  - `entity`
  - `other`
  - `reflection`
- `kind` 表达记忆稳定性
  - `episodic`
  - `semantic`

### 5.2 Memory 元数据扩展

在现有 metadata 基础上扩展以下字段：

- `kind`
- `source`
- `stability`
- `confidence`
- `tags`
- `supersedes`
- `superseded_by`
- `last_accessed_at`
- `access_count`
- `project_id`
- `session_id`

字段含义：

- `stability`
  - 表示内容是否更像长期知识，范围建议 `0..1`
- `confidence`
  - 表示该记忆可信度，避免 agent 将不确定推断当作硬事实
- `supersedes` / `superseded_by`
  - 用于记录新决策覆盖旧决策的关系
- `access_count`
  - 为后续压缩与保留策略提供依据

### 5.3 Profile 数据模型

建议使用 JSON 文件：

```json
{
  "version": 1,
  "projectId": "codex-memory-mcp",
  "defaultScope": "project:codex-memory-mcp",
  "fallbackScopes": ["global"],
  "writePolicy": {
    "defaultKind": "episodic",
    "promoteDecisionToSemantic": true
  },
  "recallPolicy": {
    "maxScopes": 2,
    "preferProject": true
  }
}
```

加载优先级：

1. 项目内 `.codex/memory-profile.json`
2. 用户级 `~/.codex/memory/profiles/default.json`
3. 内置默认配置

## 6. MCP 工具设计

### 6.1 保留工具

保留现有工具：

- `memory_store`
- `memory_recall`
- `memory_update`
- `memory_forget`

### 6.2 新增工具

首版新增以下工具：

- `memory_list`
  - 列出指定 scope/category 下的记忆
- `memory_export`
  - 导出为 `jsonl`
- `memory_import`
  - 从 `jsonl` 导入
- `memory_compact`
  - 执行去重、低价值清理、supersede 标记修复

可选新增但不作为首版必须项：

- `memory_promote`
  - 将 episodic 提升为 semantic
- `memory_profile_resolve`
  - 输出当前 profile 与 scope 决议结果

### 6.3 工具输入约束

首版输入原则：

- 所有工具继续使用显式 `scope`
- 当未传 `scope` 时，使用 profile 解析出的 `defaultScope`
- recall 默认使用 `project scope + fallbackScopes`

这样可以保持向后兼容，同时逐步引入 profile 驱动行为。

## 7. 检索与排序策略

### 7.1 Recall 作用域

当提供 `projectId` 或 profile 存在时，默认检索：

1. `project:<project-id>`
2. `global`

如果用户显式传 `scope`，则以显式参数优先。

### 7.2 排序公式

当前系统已支持向量检索与 BM25 融合。首版新增重排层：

```text
finalScore =
  retrievalScore * 0.55 +
  importance * 0.20 +
  recencyScore * 0.15 +
  stability * 0.10
```

说明：

- `retrievalScore`
  - 现有 hybrid recall 结果
- `importance`
  - 用户或系统标注的重要程度
- `recencyScore`
  - 新近访问/更新的内容更容易被召回
- `stability`
  - semantic 记忆通常高于 episodic

### 7.3 冲突处理

如果一条记忆被更新并设置了 `superseded_by`，默认 recall 中：

- 不优先返回被覆盖条目
- 必要时仅在调试/列出模式下展示历史版本

这样可以保留历史，同时减少旧决策污染。

## 8. Skill 工作流设计

skill 负责定义 agent 使用 memory 的时机和边界，不负责底层存储实现。

### 8.1 触发场景

该 skill 应在以下场景触发：

- 用户要求“记住”“回忆”“沉淀”“整理经验”
- 用户要求构建长期上下文、项目知识库、个人偏好系统
- 用户显式提到 memory、retrieval、long-term context、portable memory
- 任务涉及跨会话延续同一项目目标

### 8.2 工作流

标准工作流如下：

1. 任务开始前先 `memory_recall`
2. 仅在高价值信息出现时 `memory_store`
3. 任务完成后沉淀本次决策与稳定偏好
4. 如果新决策覆盖旧决策，优先 `memory_update` 或建立 supersede 关系

### 8.3 写入准则

优先写入的内容：

- 项目架构决策
- 用户明确表达的偏好
- 已被确认的规范与约束
- 后续任务高概率复用的上下文

避免写入的内容：

- 一次性临时命令输出
- 未确认的猜测
- 低信息量重复表述
- 可从代码直接重建的显式事实

### 8.4 Scope 策略

默认规则：

- 项目内约定写入 `project:<project-id>`
- 长期通用偏好写入 `global`
- 若无法判断，优先 `project`

## 9. 可移植性设计

### 9.1 导出格式

导出使用 `jsonl`，每行一条 memory 记录，包含：

- 主记录字段
- metadata
- schema version

示例：

```json
{"schemaVersion":1,"id":"...","text":"Always use apply_patch for edits","scope":"global","category":"preference","importance":0.95,"timestamp":1770000000000,"metadata":{"kind":"semantic","tags":["editing","workflow"]}}
```

### 9.2 可移植资产

实现迁移时至少应能打包以下内容：

1. LanceDB 数据目录
2. `jsonl` 导出文件
3. memory profile 文件
4. skill 目录

首版要求中，`jsonl` 导入导出是强制能力；直接复制 LanceDB 数据目录作为可选快捷迁移方式。

### 9.3 兼容策略

导入逻辑必须支持：

- 缺少新 metadata 字段的旧记录
- `scope` 缺失时回退到 `global`
- schema version 未来递增时做兼容解析

## 10. 压缩与治理

### 10.1 Compact 目标

`memory_compact` 负责：

- 合并明显重复的记忆
- 标记被覆盖的旧决策
- 删除低价值、低置信度、长期未访问且低重要度的噪声

### 10.2 基础规则

首版采用保守规则：

- 文本高度相似且 scope/category 接近时，可视为候选重复
- 对 `decision` 类记忆优先保留最新且置信度更高的版本
- 仅自动删除低重要度且低稳定度的内容
- 对高重要度记忆默认不自动删除，只标记和降权

## 11. 错误处理

### 11.1 Profile 错误

- profile 文件不存在：回退到默认配置
- profile 文件格式错误：返回明确错误并允许用户忽略 profile 继续执行

### 11.2 Import 错误

- 非法 JSONL：报告行号与错误原因
- vector/model 不兼容：允许导入原始文本与 metadata，再按当前 embedder 重建向量

### 11.3 Recall 错误

- 某个 fallback scope 检索失败时，不阻断整个 recall
- 返回已成功的 scope 结果，并附带部分失败信息

## 12. 测试策略

首版测试分三层：

1. 单元测试
   - profile 解析
   - ranking 计算
   - export/import schema 兼容
2. 集成测试
   - store -> recall -> update -> export -> import roundtrip
   - `project + global` 混合作用域召回
3. skill 验证
   - 给定真实任务描述，验证是否先 recall，再在结束时沉淀有效记忆

重点回归场景：

- 默认 scope 正确解析
- `project` 记忆优先于 `global`
- superseded 旧决策不会在默认 recall 中抢占结果
- 从旧数据导入后仍可成功 recall

## 13. 实施顺序

建议按以下顺序实施：

1. 引入 profile 解析与默认 scope/fallback scope 逻辑
2. 扩展 metadata 结构与 ranking 逻辑
3. 新增 `memory_list`、`memory_export`、`memory_import`
4. 新增 `memory_compact`
5. 创建 memory skill
6. 用真实项目任务验证 recall/store workflow

## 14. 验收标准

首版完成时，系统必须满足：

1. 可以在新机器导入并恢复 memory 数据。
2. 同一项目中，默认 recall 优先命中 `project:<project-id>`。
3. `global` 偏好可以跨项目复用。
4. 新决策可以覆盖旧决策而不丢失历史。
5. Codex skill 能稳定执行“先 recall、再执行、后沉淀”的工作流。

## 15. 风险与取舍

主要风险：

- 过度自动记忆会快速引入噪声
- project/global 边界判定不稳定时会影响召回质量
- metadata 扩展过快会增加兼容复杂度

首版取舍：

- 优先让系统可移植、可治理、可解释
- 暂缓复杂自动抽取与 UI
- 保持 MCP 工具显式可控，skill 负责流程约束

## 16. 结论

本设计选择在现有 `codex-memory-mcp` 基础上演进，而不是另起炉灶：

- 底层继续由 MCP server 提供独立 memory 能力
- 中层以 profile 统一项目身份、scope 与 recall policy
- 上层通过 skill 固化 Codex 的记忆工作流

这能同时满足“可移植”和“可复用”两个核心要求，并为后续引入更强的长期记忆抽取、跨项目经验复用和多 agent 协作留下稳定扩展面。
