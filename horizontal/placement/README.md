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

| [src/project-copy-preview.ts](src/project-copy-preview.ts) | `previewProjectCopy`：从公开 owner 端口读取已选择项目及明确依赖，给出无正文预览和确认指纹 |
| [src/project-copy-identity.ts](src/project-copy-identity.ts) | `projectCopyIdentities`：从持久操作身份确定独立的新项目及对象身份 |

合同在 `@molis-ai/molis-work-contracts/services/placement`（系统动作）和 `@molis-ai/molis-work-contracts/platform/actions`（插件实现的放置协议：按输入类型发现移动、复制动作，类型 id 是 `molis.placement.move.input.v1`、`molis.placement.move.output.v1`、`molis.placement.copy.input.v1`、`molis.placement.copy.output.v1`，常量在 `packages/contracts/src/platform/placement.ts:11-14`）。Host 装配在 [apps/local-host/src/placement-actions.ts](../../apps/local-host/src/placement-actions.ts)。（2026-11-08 审计更正：原写作「插件实现的放置协议 `molis.placement.move/copy.v1`」；现行没有名为 `molis.placement.move/copy.v1` 的动作——插件按 `input_type` 声明放置动作，动作名形如 `pages.placement.move`、`pages.placement.copy`（`tooling/gates/actions/actions.tsv`）。）

## 接入与边界

插件声明对象读取器即可被描述和关联；声明移动、复制协议动作即可移动、复制；声明工作流内容站 `receive` 即可作为“转成”的去处。Host 与本服务都不改。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只取 `canonicalJsonText`、`compareCodeUnits`）。

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
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只取复制预览指纹用的 `canonicalJsonText` 和排序用的 `compareCodeUnits`）。方向：只依赖合同和公开 SDK；关系存储、位置列表与按位置打开的动作客户端由 Host 注入（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - Host 每次调用创建保留原信号和同步授权检查的服务端口；关系、标题缓存与跨 owner 目标提交在各自实际写点复查。共享服务不保存可覆盖的当前 caller，已知部分提交保留供人核对。
  - 对象正文与是否存在只向所有者读取；本服务只保存自己记下的关系与最近见过的标题（缓存）。
  - 「挂到 Goal」这类由所有者保存的对象—目标关系，按动作上的 `placement_relation` 声明在目录里找（列出、挂上、取消、候选、建成五个角色），不按能力 id、不点插件名；缺哪个角色那个操作就是 `placement.target_unavailable`；同一个关联被不止一个可用的提供方声明时，所有操作都是 `placement.relation_ambiguous`，五个角色只取自同一个提供方（PG-032）。
  - 移动保持对象身份，旧引用经位置索引找到新位置；移入某项目时，指向该项目的“用于项目”关系自动去掉。
  - 移动、复制与移回原处只选择唯一可用的匹配动作；多个匹配时报 `placement.target_unavailable`，`kind: conflict`，`details.actions` 列出冲突动作，不调用任一方或写放置账本。只执行移动/复制时不解析另一协议；描述会检查两者。payload 转换只在目标创建成功且原调用控制允许后缓存源标题。
  - 删除与读不到分开：所有者报 `not_found` 才是“原对象已删除”，其余是“暂时读不到”并带原因。
  - 改变位置与访问范围的动作只对本机用户开放；助理和工作流只能读取描述。
- 改动后必跑：`node scripts/run-tests.mjs tests/work-placement-restart.test.ts tests/work-placement.test.ts tests/placement-relation.test.ts tests/placement-relation-declarations.test.ts tests/placement-provider-ambiguity.test.ts`

- 项目复制预览改动另跑：`node scripts/run-tests.mjs tests/security-invariants-project-copy-preview.test.ts tests/security-invariants-project-copy.test.ts`。
- 相关手册：[specs/archive/work-placement/spec.md](../../specs/archive/work-placement/spec.md)、[skills/molis-plugin-dev/placement.md](../../skills/molis-plugin-dev/placement.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

项目复制预览只证明传入的 owner 端口：不把缺失端口当成没有数据，不替 Host 宣称整项目覆盖。明确依赖缺失、owner 不可用或指向未勾选项目时保留阻塞原因，确认拒绝；有环的已读依赖去重。确认重新读取全部根记录（包括原本为空的项目）及依赖，原件新增、删除或修改均要求重新预览。正文保持在服务端，不进入预览视图；`savedBytes` 仅为保存图的 JSON 字节，不冒充附件总量或云端容量。单轮预算为 50,000 个资产及依赖、512 MiB JSON，超限拒绝而不截断。

映射由可信源空间、目标空间和持久操作身份共同确定，重试相同，不同账号、项目、操作或 kind 隔离。生成映射不代表操作已持久化，也不授予同步、运行或审批权限；持久回执、全部 owner、提交编排与用户入口仍须另行接通。

`createProjectCopyJournal` 通过注入的原子条件文档保存格式 v1 的本机回执：确认指纹、稳定身份、目标内容摘要、owner 提交及项目发布阶段，不保存源正文或授权。旧格式、错空间和同操作不同计划拒绝，不作转换。`executeProjectCopy` 先保存完整计划，再调用目标 owner；迟到 ACK 可沿同一身份幂等重放。新尝试令牌立即使旧尝试失效，目标工厂必须把检查接入 owner 的最终事务，异步准备/发布必须在等待后重检。准备阶段不可创建可见项目，全部内容提交前不能发布。已完成请求直接返回原回执，不覆盖后来独立编辑。当前 Host 仅提供个人 Home 回执适配器；实际项目文件暂存、全部 owner 与 HTTP/UI 装配尚未完成。
