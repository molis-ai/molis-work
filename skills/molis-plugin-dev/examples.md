# 现有插件怎么对照

挑最近的同类抄结构，不要混抄。

三件都叫「事件」，对照前先认路：Functions「用在哪」是首页/Inbox/Feed 的判断去向；插件 `events` 是 Coding 族总线；Integration 进来的是 Signal。

## Feed：外来消息的去向

人盯着一条 `feed_item`。详情上四条竞争处置：加入 Inbox、保存、升格 Goal、忽略。

- UI：plugin-stage，来源任务 fold，点行出详情。
- HTTP：Host `/api/feed/items/:id/(inbox|save|promote|archive|…)`。
- behaviors：`save` / `promote` / `archive`；`inbox.admit` 是系统项。
- 场景：`feed.capture`。`feed.open` 只映射「留在 Feed」，不是 footer 按钮。打开原文常驻。
- 不进池：标已读、恢复、来源设置、token、计划。
- MCP：没有与 Functions 同级的独立 store 入口，不包一层 MCP。
- Integration 是别的插件；Feed 只消费 Signal/Item。

## Inbox：注意力引用

人盯着一条 `inbox_entry`。处置只有做完了 / 忽略。查看原消息是导航。

- 不读 Feed / Goals 表，标题由 Host 注入。
- 场景：`action_scenes` 中的 `inbox.next`，兑现 prepare/bind/consume/failed。显式调用和 Feed 自动事件共用绑定及执行，不再依赖旧 `functions.evaluate`。
- 完成/忽略只改 Attention 状态，不删原对象。

## Pages / Forms / Dataset / PPT：本机创作

人盯着一份正在编的文档/表/问卷。工作台是编辑器，不是「新消息该去哪」。

- catalog `personal: true`。plugin-stage 列表 + 编辑面 + `CLIENT_FACTORY_SCRIPT`。
- MCP：`list/get/create/update/…`，默认项目 scope，Host 注入 `project_id`。新工具默认关。
- `pages.promote` 走 MCP 和工作台按钮，进 Agent，不进 Feed/Inbox 事件池。
- 不声明 `function_scenes`。私人库用 `storage:private`。

## Functions：写判断本身

三栏：看什么 / 函数 / 用在哪。去向文案说人会看到什么。Choice 选项可自定义，绑现场用 `scene_map`，不覆盖选项。设置页只配 TypeSafe Key。MCP 三项 `scope: home`。不要抄成 plugin-stage 列表。

别的插件消费判断，走 [host.md](host.md#接到统一判断场景)，不要复制旧编辑器或添加新的 Host 去向白名单。

## 灵光：岛

人盯着一条还没想清楚的想法。`slot: "island"`，不是侧栏插件条。丢掉 / 分发是对象上的处置，但今天没有 Functions 事件场景，不要新开 `function_scenes`。catalog `personal: true`。

## Schedule：到点叫醒

人盯着定时任务。`kind: "native"` 但有 `agent`。HTTP 走 `web-request.ts` 的 schedule handler。不要把 Coding 的 workspace-write 角色抄过来。

## Sessions / Shelf / Artifacts / Goals

- Sessions：会话列表和终端，不是消息去向。包在 `plugins/native/work`，全球 id `io.molis.work.sessions`，项目短名 `sessions`。终端传输留在 Host。
- Shelf：置物架文件与摘录，`personal`，有设置页。
- Artifacts：打开已保存成果和版本。
- Goals：树、画布、提案、决定。采用/退回是对象处置，同样先不要塞进 Feed/Inbox 池。

要做就单独立场景、判断时机、已接线按钮。

## Text stats：最小完整 app

人盯着绑来的一份文本快照。`kind: "app"`，`slot: "stage"`，一个必选输入口，无存储、无事件、无输出口。消费绑定 Artifact 若比这还重，平台就过重了。新端口消费者从这里抄声明形状。产品里还没有连线页，这个口在跑着的产品里不会自己接上。

## Diff / Files / Git

- Diff：三组可选输入（两份快照 / Run 变更 / Git 变更），`input_groups`，没绑也能激活并说明自己。
- Files：浏览工作区；`onEvent` 在 Coding/Git 发 file-changed 之后重读目录。事件 id 来自合同，不 import Coding 包。这是插件事件总线，不是 Functions 去向。
- Git：工作区改动；目录通过当前项目设置读取。抄事件订阅时点名 `from_plugin_ids`，不要通配。

## Coding：Runtime 托管的 app

`kind: "app"`。Artifact 输出口、事件、`agent` 角色、commands（写清 `input_kinds`）。`start()` 必须兑现 views。还没有可绑定的上游 Artifact 类型，所以 `ports.inputs` 为空；Goal 上下文走 Goals Capability。不要抄它的 agent 块到普通内容插件。生产 `tools/call` 未接 Runtime，不要填 `mcp_exports`。

## GitHub / Gmail 等接入

Connector + Signal + 设置页。`whoami`、连接、断开不进 `feed.capture`。有 OAuth 的抄 Gmail/GitHub 的 secret 引用，不要把 token 写入私人存储。目录类连接器抄 catalog，不要新复制一份 GitHub。

## 新开去向的反例

Goals「采用 / 退回」、灵光「丢掉 / 分发」是对象上的处置，今天没有「到来时判断亮按钮」的场景和接线。先不要新开 `function_scenes`。
