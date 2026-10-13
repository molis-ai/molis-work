# 现有插件怎么对照

挑最近的同类抄结构，不要混抄。

三件都叫「事件」，对照前先认路：判断场景（`action_scenes`）是首页/Inbox/Feed 的判断去向；插件 `events` 是 Plugin Runtime 启动的插件之间的总线（Coding 族、Characters、Shelf 与已安装插件）；Integration 进来的是 Signal。

## Feed：外来消息的去向

人盯着一条 `feed_item`。详情上四条竞争处置：加入 Inbox、保存、升格 Goal、忽略。

- UI：plugin-stage 外壳里的文章列 + 阅读页：来源收在列顶的来源菜单，时间线 + 全部 / 未读 / 已保存，点卡片在右侧读。
- HTTP：Host `/api/feed/items/:id/(inbox|save|promote|archive|…)`。
- 动作：`feed.*` 与内容协议 `feed.content.*`；处置按钮由事项动作查询准备，旧 HTTP 只转发。
- 场景：`feed.capture`。`feed.open` 只映射「留在 Feed」，不是 footer 按钮。打开原文常驻。
- 不进池：标已读、恢复、来源设置、token、计划。
- MCP：动作经统一目录对外，不另包一层 MCP。
- Integration 是别的插件；Feed 只消费 Signal/Item。
- 搜索：`feed.search.entries` 只给摘要（`content: "summary"`）：标题、摘要、来源、标签；保留正文加密存放，不进索引。来源也是一种条目，打开到 Feed。

## Inbox：注意力引用

人盯着一条 `inbox_entry`。处置只有做完了 / 忽略。查看原消息是导航。

- 不读 Feed / Goals 表，标题由 Host 注入。
- 场景：`action_scenes` 中的 `inbox.next`，兑现 prepare/bind/consume/failed。显式调用和 Feed 自动事件共用绑定及执行，不再依赖旧 `functions.evaluate`。
- 完成/忽略只改 Attention 状态，不删原对象。
- 搜索：`inbox.search.entries` 只列未处理的事项（仅摘要）；做完或忽略后不在列表里，就从索引里删掉。

## Pages / Forms / Dataset / PPT：本机创作

人盯着一份正在编的文档/表/问卷。工作台是编辑器，不是「新消息该去哪」。

- catalog `personal: true`。plugin-stage 列表 + 编辑面 + `CLIENT_FACTORY_SCRIPT`。
- MCP：`list/get/create/update/…`，默认项目 scope，Host 注入 `project_id`。新工具默认关。
- `pages.promote` 走 MCP 和工作台按钮，进 Agent，不进 Feed/Inbox 事件池。
- 判断场景用 `action_scenes`（`inbox.next`），不再有 `function_scenes`。私人库用 `storage:private`。
- 搜索：每种对象一个读取器（`<plugin>.subject.read`）加一个 `<plugin>.search.entries`（`content: "context"`），正文从读取器来。照抄 `plugins/native/form/src/search.ts`；Dataset、PPT 同形，Pages 的读取器在 `pages` 自己的动作里。问卷的填写结果不进索引。见 [search.md](search.md)。

## 判断规则（系统能力，不是插件）

判断规则由 `modules/functions` 拥有，编辑器在「能力」（`apps/workbench/src/functions`）：写、试跑、发布；TypeSafe 连接在「能力 → 服务连接」。不要把它当插件模板抄。

别的插件消费判断，走 [host.md](host.md#接到统一判断场景)，不要复制旧编辑器或添加新的 Host 去向白名单。

## 灵光：岛

人盯着一条还没想清楚的想法。`slot: "island"`，不是插件切换列表里的一级入口。丢掉 / 复制内容是对象上的处置；今天没有判断场景，不要为它新开 `action_scenes`。catalog `personal: true`。搜索来源只列未丢弃的灵光。

## Schedule：到点叫醒

人盯着定时任务。`kind: "native"` 但有 `agent`。HTTP 走 `web-request.ts` 的 schedule handler。不要把 Coding 的 workspace-write 角色抄过来。

## Sessions / Shelf / Artifacts / Goals

- Sessions：会话列表和终端，不是消息去向。包在 `plugins/native/work`，全球 id `io.molis.work.sessions`，项目短名 `sessions`。终端传输留在 Host。
- Shelf：置物架文件与摘录，`personal`，有设置页。
- Artifacts：打开已保存成果和版本。
- Goals：树、画布、提案、决定。采用/退回是对象处置，同样先不要塞进 Feed/Inbox 池。
- 搜索：Sessions 只给摘要（终端正文不进索引）；Artifacts 列每个成果的最新版本；Goals 的条目版本与读取器版本一致。Shelf 的材料照常对外；剪贴板历史原本只给本机的人，所以单独一个受众为 `["user"]` 的来源（`shelf.clipboard.search.entries`）——来源的受众不能比你原有的读取更宽。

要做就单独立场景、判断时机、已接线按钮。

## Text stats：最小完整 app

人盯着绑来的一份文本快照。`kind: "app"`，一个 `navigator` 入口加一个 `stage` 视图，一个必选输入口，无存储、无事件、无输出口，也不声明搜索来源（没有自己拥有的内容）。消费绑定 Artifact 若比这还重，平台就过重了。新端口消费者从这里抄声明形状。默认连线把它接到 Files 的 `before` 快照（`workspace-plugin-bindings.ts`）；新插件照抄它的声明不会进那份默认名单。

## Diff / Files / Git

- Diff：三组可选输入（两份快照 / Run 变更 / Git 变更），`input_groups`，没绑也能激活并说明自己。
- Files：浏览工作区；`onEvent` 在 Coding/Git 发 file-changed 之后重读目录。事件 id 来自合同，不 import Coding 包。这是插件事件总线，不是 Functions 去向。
- Git：工作区改动；目录通过当前项目设置读取。抄事件订阅时点名 `from_plugin_ids`，不要通配。
- 三者都不声明搜索来源：文件与改动归工作区和 Git，快照已经是 Artifact，经 Artifacts 可搜。

## Coding：Runtime 托管的 app

`kind: "app"`。有 Artifact 输出口；6 个可选输入口（Shelf 材料、Files 快照与选区、Git 变更与结果），默认连线见 `workspace-plugin-bindings.ts`；还有事件、`agent` 角色和 commands（写清 `input_kinds`）。`start()` 必须兑现 views。Goal 上下文与进展走 Goals Capability（`goals.context.list.v1`、`goals.context.read.v1`、`goals.progress.record.v1`、`goals.progress.receipt.v1`）。不要把它的 agent 块抄到普通内容插件。对外调用只走动作的 `audiences` 与授权，不另声明。搜索来源 `coding.search.entries` 经路由兑现（`/search/entries`）；Runtime 里的内置插件加动作要升版本，随宿主升级，不写 `upgrade_compatibility`（Characters 用 `bindOwnerPluginAction`，同理）。

## GitHub / Gmail 等接入

Connector + Signal + 设置页。`whoami`、连接、断开不进 `feed.capture`。有 OAuth 的抄 Gmail/GitHub 的 secret 引用，不要把 token 写入私人存储。目录类连接器抄 catalog，不要新复制一份 GitHub。

## 新开去向的反例

Goals「采用 / 退回」、灵光「丢掉 / 复制内容」是对象上的处置，今天没有「到来时判断亮按钮」的场景和接线。先不要新开 `action_scenes`。
