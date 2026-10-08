# 平台记忆

个人与项目记忆的平台服务：开关与策略、确定性写入门、召回编排、待认可的建议、最近变动与撤销、界面信号计数。记忆正文、版本、删除与作用域隔离都在 Prologue Memory（经 Agent Host），本服务不保存第二份正文，也不调用模型。

包名：`@molis-ai/molis-work-service-memory`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

助理的一轮开始前，Host 以“助理”这个使用方调用 `MemoryService.recall`：服务按用户的开关确定能读哪些范围（个人、当前项目），从 Prologue Memory 读出条目，结合 Host 记下的类别、适用情境、状态和有效期逐条过滤，用中文两字片段与英文词打分，按上限与字数预算取用，把用上的和因预算没带上的都记成使用回执（设置里显示“最近用于”）。用户说“以后都……”时，`write` 经写入门：开关、秘密形状、像指令的文字、范围、重复与冲突，最后才写入 Prologue Memory 并记一条“最近变动”。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `MemoryService`：列出、召回、写入门、修改与移动、候选、最近变动与撤销、界面信号、整理与维护 |
| [src/prefs.ts](src/prefs.ts) | 开关的默认值、补全与使用方权限 |
| [src/text.ts](src/text.ts) | 召回关键词、同文判断、秘密形状与像指令的文字（确定性规则） |

合同在 `@molis-ai/molis-work-contracts/services/memory`（`memory.*` 动作、旁表端口）。旁表由 `@molis-ai/molis-work-storage` 的 `openMemoryLedger` 实现；Host 装配（Prologue 后端、动作注册、`/api/memory/*`）在 [apps/local-host/src/memory/memory-host.ts](../../apps/local-host/src/memory/memory-host.ts)。

## 接入与边界

使用方只经 `memory.*` 动作或 Host 进程内的服务调用；使用方身份来自可信调用上下文（受众），不从输入读。插件只能读到被允许的类别；外部 AI 客户端默认读不到个人记忆。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-memory typecheck
pnpm --filter @molis-ai/molis-work-service-memory build
```

## 开发要求

- 负责：开关与使用方权限、写入门（开关、秘密、像指令的文字、范围、重复与冲突、自动写入的决定表）、召回的过滤与排序与预算、使用回执、候选的规则（同文只提一次、每项工作最多 3 条、14 天过期）、最近变动与撤销、版本历史、界面信号计数与门槛、第一版数据迁移。
- 不负责：记忆正文的存储、版本号、墓碑与作用域隔离（Prologue Memory）；模型调用与提炼（Agent Host）；交互规则（助理规则引擎）；项目说明（Goals）；设置页面（Workbench）。
- 公开入口：`@molis-ai/molis-work-service-memory`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/memory`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 模型只提议不批准：自动写入由确定性的写入门决定，规则版本写进来源与最近变动。
  - 单次行为、仅靠推断的内容、背景事实、像指令的文字、形似秘密的文字都不会被自动写入；推断不能覆盖用户明确说过的。
  - 停用、暂停、过期、不适用的记忆不会被召回；某使用方的开关关掉后它拿不到记忆。
  - 删除后存储、旁表（历史、使用记录）、最近变动的正文、重启之后都不再带出该条。
  - 项目被删除时 `purgeProjectMemories` 清掉该项目及其角色的记忆（存储里的条目与候选）和账本里与之相关的一切（修订、使用、变动、候选记录、成对提示、开关、界面计数）；角色的范围从账本记下的所有者（写入记忆时才记下）和候选记录上的项目找到，所以只有建议、没有写过记忆的角色也清得掉；Home 里没有 Agent 运行环境时 `backend` 为 null，只清账本；不需要预览指纹确认，删除项目就是本人的确认。
  - 个人记忆的出处不写项目里的工作名；个人记忆只归本人。
- 改动后必跑：`node scripts/run-tests.mjs tests/memory-service.test.ts tests/memory-actions.test.ts tests/assistant-memory.test.ts tests/project-deletion-memory.test.ts`
- 相关手册：[specs/archive/memory-system/spec.md](../../specs/archive/memory-system/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/memory`
- Migration Goals: `goal-reorg-f2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
