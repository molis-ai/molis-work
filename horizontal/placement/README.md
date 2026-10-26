# 放置服务

对象放在哪里（个人空间或某个项目）、谁能看到、和哪些工作有关，以及怎样移动、复制、转成别的内容。需求与语义见 [specs/archive/work-placement/spec.md](../../specs/archive/work-placement/spec.md)。

包名：`@molis-ai/molis-work-service-placement`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

用户在项目 Q4 里把个人空间的一篇文档“用于项目”：Host 的 `placement.link` 系统动作交给 `PlacementService.link`。服务按位置索引找到文档现在在哪个分区，用本机用户在那个分区的权限向 Pages 的对象读取器（`pages.subject.read`）确认它存在，再在自己的 Context Ledger 分区记一条 `placement.used_in` 关系。项目首页经 `placement.related` 列出它；读取时总是回到 Pages，文档删除后显示“原对象已删除”。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `PlacementService` 保留描述、关联、移动恢复与位置索引；同文件函数处理 Goal 查询、复制/转成与位置显示，操作仍绑定原实例的读取与提交 |

合同在 `@molis-ai/molis-work-contracts/services/placement`（系统动作）和 `@molis-ai/molis-work-contracts/platform/actions`（插件实现的放置协议 `molis.placement.move/copy.v1`）。Host 装配在 [apps/local-host/src/placement-actions.ts](../../apps/local-host/src/placement-actions.ts)。

## 接入与边界

插件声明对象读取器即可被描述和关联；声明移动、复制协议动作即可移动、复制；声明工作流内容站 `receive` 即可作为“转成”的去处。Host 与本服务都不改。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-placement typecheck
pnpm --filter @molis-ai/molis-work-service-placement build
```

## 开发要求

- 负责：按对象身份说明位置、访问范围、关联和打开位置；用于项目（关联）与移除；移动后的位置索引；复制与转成的来源记录；经协议调用插件的移动、复制与接收。
- 不负责：插件的存储与业务规则、对象正文（永远向所有者读取）、Goal 事实、权限的授予、可信身份的来源。
- 公开入口：`@molis-ai/molis-work-service-placement`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/placement`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同；关系存储、位置列表与按位置打开的动作客户端由 Host 注入（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - Host 每次调用创建保留原信号和同步授权检查的服务端口；关系、标题缓存与跨 owner 目标提交在各自实际写点复查。共享服务不保存可覆盖的当前 caller，已知部分提交保留供人核对。
  - 对象正文与是否存在只向所有者读取；本服务只保存自己记下的关系与最近见过的标题（缓存）。
  - 「挂到 Goal」这类由所有者保存的对象—目标关系，按动作上的 `placement_relation` 声明在目录里找（列出、挂上、取消、候选、建成五个角色），不按能力 id、不点插件名；缺哪个角色那个操作就是 `placement.target_unavailable`；同一个关联被不止一个可用的提供方声明时，所有操作都是 `placement.relation_ambiguous`，五个角色只取自同一个提供方（PG-032）。
  - 移动保持对象身份，旧引用经位置索引找到新位置；移入某项目时，指向该项目的“用于项目”关系自动去掉。
  - 移动、复制与移回原处只选择唯一可用的匹配动作；多个匹配时报 `placement.target_unavailable`，`kind: conflict`，`details.actions` 列出冲突动作，不调用任一方或写放置账本。只执行移动/复制时不解析另一协议；描述会检查两者。payload 转换只在目标创建成功且原调用控制允许后缓存源标题。
  - 删除与读不到分开：所有者报 `not_found` 才是“原对象已删除”，其余是“暂时读不到”并带原因。
  - 改变位置与访问范围的动作只对本机用户开放；助理和工作流只能读取描述。
- 改动后必跑：`node scripts/run-tests.mjs tests/work-placement-restart.test.ts tests/work-placement.test.ts tests/placement-relation.test.ts tests/placement-relation-declarations.test.ts tests/placement-provider-ambiguity.test.ts`
- 相关手册：[specs/archive/work-placement/spec.md](../../specs/archive/work-placement/spec.md)、[skills/molis-plugin-dev/placement.md](../../skills/molis-plugin-dev/placement.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
