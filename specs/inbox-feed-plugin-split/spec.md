# Inbox / Feed 独立插件

状态：切片 6 完成（删兼容路径；浏览器走查已补）。具体设计见 `design.md`。完成等级目标：功能可用，再收到内部完整。

承接当前工作台里 Feed 插件同时拥有 Inbox、Feed、来源的打包。产品决定走方案 1：Inbox 与 Feed 分成两个 Native Plugin；来源暂时留在 Feed。Feed 规则命中后直接生成 Artifact，不经确认、不回刷历史。历史「Inbox 是 Feed preset / item_type」的兼容逻辑和代码允许删除，不为旧打包做双轨。

## 背景目标

Inbox 是注意力，Feed 是事实流。现在两者共用一个目录、一个 preset、一套 `item_type: feed | inbox_message`，所以 Inbox 看起来像过滤后的 Feed。Goal 待判断和来源故障能进 Inbox，是 Feed 插件自己去捞，不是 Inbox 去听别的插件。

目标：Inbox 成为独立插件，只保存需要介入的引用，可配置订阅。Feed 成为独立插件，管来源和完整流水，可配置 out 规则；命中后由 Feed 插件作为生产者调用 Artifacts Command，立刻留下精确版本。

## 当前行为与问题证据

- 产品打包：`DESIGN.md`「Feed owns Inbox and Sources」；插件条只有 Goals / Sessions / Feed / Artifacts；`immersive-feed-views` 把 Inbox / Feed / 来源放在 Feed 里。
- UI：`FeedUiPreset = "feed" | "inbox_message"`，同一 `feed-directory` 切预设。
- 投影：`plugins/native/feed/src/projection.ts` 已承认 `feed_items` 与 `inbox_entries` 是两套事实，`items` 是「当前合并工作台的临时兼容投影」。
- 部分来源仍把条目写成 `item_type: inbox_message`（`feedItemTypeForSource`）。
- Feed Module 不直接创建 Artifact；现有 promotion 只走 Goal（`promoteFeedItemToGoal`）。
- Attention Module 已存在，但不拥有独立 Plugin / 目录。

## 已锁定决策

1. 方案 1：Inbox Plugin + Feed Plugin；来源暂留 Feed。
2. Feed out 命中后直接出 Artifact，无候选、无确认。
3. 新规则 **不回刷** 已有 Feed Item。
4. 成功出 Artifact **不进 Inbox**。失败（规则命中但 Command 未成功）**进 Inbox**。
5. Inbox 只订阅「需要介入」的事件，不订阅任意 Artifact/插件变更。
6. 允许清理历史兼容：合并工作台、preset、`inbox_message` item_type、把 Goal 决定塞进 Feed 目录的投影。不为旧 UI 保留双轨。

## 范围与非目标

做：Inbox Native Plugin（目录、详情、订阅规则、Attention 用例）；Feed Plugin 去掉 Inbox 所有权，只保留来源 + 流水 + out 规则 + 手动升格 Goal；Workbench 插件条与根目录挂两个入口；现有 Attention / Feed Item 数据可读、可继续处置；一次性把仍为 `inbox_message` 的 Feed Item 拆成「事实在 Feed、注意力在 Attention」。

不做：来源拆成第三插件；Inbox 监听所有变更；规则回刷历史；把 Feed 条目改写成 Artifact；Feed Module 写 Artifact 表；改 Goal / Artifact / Sources / Signals / Listener Host（拉 GitHub/Gmail）的 owner；云端同步与 Team 共享策略。

## 使用场景

GitHub 通知永远进 Feed。规则「标签含 launch」命中则立刻生成 Artifact，Artifacts 目录出现精确版本，Inbox 不出现。Goal 待判断由 Goals 投 Attention，只出现在 Inbox。来源授权失效由 Feed 投 Attention。用户在 Feed 点「加入 Inbox」只创建 Attention 引用。新建 out 规则后，昨天的 RSS 不会变成 Artifact。

## 方案

### Inbox Plugin

- 拥有注意力产品入口：列表、原因、关联对象、下一步、完成/归档。
- 底层读写 Attention Module。条目是引用，不复制 Feed 正文或 Artifact payload。
- 订阅（产品上的 Listener，不复用 Listener Host 这个词）：声明听哪些 **Attention 事件源**（Goals 待判断、Feed 来源故障、Feed 出 Artifact 失败、用户从 Feed 加入）。不提供「监听任意 Plugin 任意变更」的通配。
- 处理完退出默认列表；原 Feed / Goal / Artifact 仍在。

### Feed Plugin

- 拥有来源、同步、Feed Item 流水、忽略/保存资料、手动升格 Goal。
- 不再拥有 Inbox 目录、preset、也不得把 Goal 决定画进自己的列表。
- Out 规则：项目本地、只对 **规则生效之后新写入或更新的** Feed Item 求值。
- 命中后 Feed Plugin 以生产者身份调用 Artifacts Command。`artifact_id` 由 `feed_item_id + rule_id` 稳定派生；同一 envelope 幂等；内容变了升 version。失败保留 Feed Item，发 Attention。
- 默认 Artifact 类型：`io.molis.work.feed.capture` schema 1（标题、摘要、来源、原文 URL、时间、材料引用）。规则以后可指定其他已注册类型，本切片不必做类型市场。

### 数据与清理

保留：Attention 表、Feed Item/Material、Sources/Signals、已有 Artifact、手动升格 Goal。

删除或停止使用：

- 工作台 `feedPreset` / `inbox_message` 双预设和 `immersive-feed-views` 里的 Inbox 按钮。
- `projection.items` 合并投影，以及「Inbox 是一种 Feed Item」的 UI 模型。
- `item_type: inbox_message` 的写入路径（含 `feedItemTypeForSource` 把部分来源写成 inbox）。
- Feed disposition 把 `inbox` 当成和 `archived` 同级的去向（加入 Inbox 改为 Attention Command）。
- Workbench 把 Goal 决定/结果投影成 Feed 目录行。
- 仅为合并工作台存在的客户端状态（`feedPresetState.inbox_message` 等）。

一次性迁移：已有 `inbox_message` Item 改为普通 Feed Item；若仍有未完成 Attention 则保留引用，没有则只留事实流。不根据新 out 规则生成 Artifact。

### 导航

插件条增加 Inbox，与 Feed 并列。根目录 Inbox 打开 Inbox 插件，Feed 打开 Feed 插件（可进到来源）。不再出现 Feed 内部的 Inbox / Feed / 来源 三按钮里的 Inbox；来源仍在 Feed 内。

现有项目目录迁移时启用 Inbox，与「已有项目保留捆绑插件」同一策略。新项目默认仍只开 Goals，Inbox/Feed 由市场启用——若与「Feed 已启用则 Inbox 一起启用」冲突，执行时选：已启用 Feed 的项目同时启用 Inbox，避免注意力入口消失。

## 输入输出与依赖

输入：现有 Feed Item、Attention、Source、Goal 决定事件。  
输出：Inbox Plugin UI/路由；Feed out → Artifact 引用；Attention 失败条目。  
依赖：Attention、Feed、Artifacts、Goals 公开 Command/Event；Workbench 插件条/目录挂载。  
不依赖：新的跨插件实现 import；不新建 Feed Router。

## 文件 / 模块边界

- 新：`plugins/native/inbox/`（UI、订阅、Attention 用例、路由）
- 改：`plugins/native/feed/` 去掉 Inbox 表面与 `inbox_message` 写入；增加 out 规则与 Artifact 生产
- 改：`apps/workbench` 插件条、根目录、去掉 feed preset 客户端
- 改：`DESIGN.md` 取消「Feed owns Inbox」
- 测试：Feed/Inbox/Artifact 定向测试替换合并工作台断言
- 不改：`modules/feed`、`modules/artifacts` 的 owner 定义。Attention 为「出 Artifact 失败」增加 reason `artifact_out_failed`（订阅面，不是改 owner）。Feed Plugin 不读 Artifact 表，只调用公开 Command。

## 验收

- 插件条能分别打开 Inbox 与 Feed；Feed 目录没有 Inbox preset。
- Inbox 条目都有原因、关联、下一步；完成不删除原对象。
- Goal 待判断只出现在 Inbox，不出现在 Feed。
- 新 Feed Item 命中 out 规则后 Artifacts 立刻有精确版本；同一条目重拉不新建 lineage。
- 新规则不给历史 Feed Item 造 Artifact。
- 出 Artifact 失败时 Inbox 有一条，成功时 Inbox 没有因成功而产生的条目。
- 仓库中不再有合并工作台所需的 `feedPreset=inbox_message` 产品路径（测试与 UI）。
- 来源仍从 Feed 进入；Listener Host 拉 GitHub/Gmail 的语义不变。

## 验证

实现后：`node --import tsx --test` 覆盖 inbox 插件、feed out→artifact 幂等/失败、不再投影 Goal 决定进 Feed；浏览器走 Inbox、Feed、来源、Artifacts（2026-09-15 已走，见 `design.md` 验证切片 6）。不回刷用「加规则后旧条目不变、新条目生成」证明。

## 假设与开放问题

- 手动「升格为 Goal」仍留在 Feed 详情，与自动出 Artifact 并存。
- Artifact 浏览器按精确版本展示 `io.molis.work.feed.capture`，无自定义 renderer 时用现有可读数据表达。
- Inbox 订阅的第一批事件源固定为：Goals 待判断、Feed 来源故障、Feed 出 Artifact 失败、Feed「加入 Inbox」。不做任意事件通配。
- 执行前若发现 Attention/Feed 缺公开 Event，先补 Contract，再写 Plugin。
