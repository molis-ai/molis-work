# Placement

**白话：** 一个对象放在哪里（个人空间或某个项目）、谁能看到、和哪些工作有关，以及怎样移动、复制、转成别的内容。它不理解对象是什么，对象的正文和是否存在总是向所有者读。

**类别：** 平台产品服务（[系统架构 §3](../system/ARCHITECTURE.md)）。「移入项目时去掉指向该项目的『用于项目』关联」「位置变动只对本机用户开放」「找不到分为已删除和暂时读不到」是跨插件的产品策略，放在这里；但放置不拥有任何插件的业务事实，也不改写插件的数据。位置暂不变动，仍在 `horizontal/placement`。

**提供：**

- 系统动作（提供方 `system.placement`，Host 装配在 `apps/local-host/src/placement-actions.ts`）：`placement.describe`、`placement.spaces`、`placement.related`、`placement.locate`、`placement.link`、`placement.unlink`、`placement.move`、`placement.copy`、`placement.convert`、`placement.create`、`placement.goals`、`placement.goal.bind`。
- 位置与访问范围的描述、用于项目的关联、Goal 资料的绑定、来自与复制自的来源记录。
- 移动、复制、转成：经插件声明的放置协议动作（输入输出类型 `PLACEMENT_MOVE_INPUT_TYPE`、`PLACEMENT_COPY_INPUT_TYPE` 等，定义在 `packages/contracts/src/platform/placement.ts`）和工作流内容站的 `receive`，不在 Host 或服务里认识任何具体插件。
- 移动后的位置索引：旧引用经它找到新位置。

**技术状态：** `{home}/placement/placement.db`（版本 1，建库代码在 `apps/local-host/src/placement-actions.ts` 的 `PLACEMENT_BASELINE`）：Context Ledger Module 的表（`modules/context-ledger`，关联以 `ObjectRef` 记录）加一张 `placement_titles` 缓存，只存最近见过的标题，用于对象被删或读不到时仍能说出它叫什么。

**不拥有：** 对象的正文、存在与否和业务规则（所有者）；Goal 事实（Goals）；权限的授予和可信身份（动作服务与各入口的授权）。改变位置与访问范围的动作只对本机用户开放，助理和工作流只能读描述。

**当前来源与 Goal：** `horizontal/placement`（`PlacementService`），Host 装配 `apps/local-host/src/placement-actions.ts`，页面传输 `apps/local-host/src/placement-http.ts`，浏览器端 `apps/workbench/src/scripts/client/placement.ts`。需求与语义见 `specs/archive/work-placement/spec.md`；写放置协议见 [`skills/molis-plugin-dev/placement.md`](../../skills/molis-plugin-dev/placement.md)；搜索结果与放置怎样配合，见 [CALL-CHAINS §7](../system/CALL-CHAINS.md)。

**已知的边界问题：** 放置的规则和对多个插件的编排放在横向服务里，关系事实已经经 Context Ledger 写入 Module 分区，没有私有表。N-03 决定「代码不搬、写清边界」；放置协议的生产方目前都是构建期插件，还没有 Runtime 插件的停用、卸载、升级用例（见 [PLUGIN-PLATFORM §9](../platform/PLUGIN-PLATFORM.md)）。
