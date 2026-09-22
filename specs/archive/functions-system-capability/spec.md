# 判断成为系统能力：函数、行为、一次判断记录

完成等级：**3 功能可用**。不宣称可发布。

## 背景目标

把 Functions 从「给 Agent 用的个人插件」做成系统常驻判断能力。系统里有判断（看一眼、给结论）和能做的事（已登记行为）。判断只负责看和挑；真动手交给拥有该行为的插件。

## 当前行为与问题证据

- 函数库和调用在 `plugins/native/functions`；对外只有 MCP `list` / `describe` / `invoke`。
- 输入是一段文本，输出是 JSON，不落一次判断实体。
- 首页第三栏按钮曾写死在 `apps/workbench/src/scripts/client/project-home.ts`（接着做 / 做完了 / 重新授权 / 问问怎么回事）。未绑时仍用这套默认；绑了之后应从已登记行为里收集、再由判断挑亮。
- Feed 捕捉规则先走关键字，需要时再请判断。
- Artifact 不能当判断身份。Feed / Inbox / 首页不能 import Functions 插件实现。

## 范围

1. 新增 `modules/functions`：已发布函数 + **一次判断**实体。别人只调合同。
2. Functions 插件变薄：写、试跑、发布、配 Key、HTTP/UI。库和判断记录在 Module。TypeSafe 由 Host 注入。
3. Host 合成行为总表：`mcp_exports`、插件 Manifest `behaviors`、系统首页/Inbox 现有动作。判断只能从这份名单里挑。插件可任意登记行为，不必是 MCP。
4. 判断先落判断记录；事件只通知 `judgment_id`。建议可以只显示。写行为不自动执行。`home.talk`（说一句）不进判断池，不能被藏掉。Inbox 详情同样：落地建议只改「标记已处理 / 忽略」谁出现；「查看原消息」不被藏。同一对象上不同场景各留最近一条建议，互不覆盖。
5. 场景绑定不另做总控台。Feed 捕捉规则用已发布函数下拉（`feed.capture`，按规则 ref）。`inbox.next` 与 `home.dock` 是 board 级绑定：开关在 Functions 已发布函数的「用在哪」，**不**出现在 Inbox 列表或首页详情。绑定 HTTP 仍是 `GET|POST /api/inbox/judgment`、`GET|POST /api/home/dock-judgment`，由 Functions 编辑器调用。各场景只列出选项 key 全部落在该场景行为池里的已发布 Choice。绑错场景返回 400。落地时（Inbox 创建 / 捕捉命中）再判断，不在点开第三栏时打模型。Feed 详情落地建议从 `feed.capture` 处置池里挑（加入 Inbox / 保存 / 升格 / 忽略）；打开原文不被藏。建议只有 `feed.open` 时不显示加入 Inbox，保存 / 升格 / 忽略仍在。判断不自动写入。动作录取标准见 [事件去向的动作范围](../function-scene-action-scope/spec.md)。
6. Manifest 可声明 `behaviors`、`function_scenes`、`judgment_subjects`，以及 `requires` 判断能力。app 插件声明的行为必须兑现 handler；native 插件由 Host 把已有点击路径接到公共行为 id。
7. 首页卡底先按这条事件的对象类型，从行为总表收集已兑现点击路径的非 MCP 行为（打开、做完、忽略、重新授权、问问、接着做等），再用 `home.dock` 判断挑亮一两个。未绑 / 空建议 / 非法建议时按钮与现在一致。`home.talk` 始终在。点击交给拥有该行为的插件（Inbox 改状态、Feed 打开/授权），首页只摆按钮。MCP 工具不进卡底。纯 Inbox 下一步函数（选项只有做完/忽略）不能绑到 `home.dock`。

## 非目标

不把判断身份做成 Artifact。不新建 `modules/judgments`、`plugins/native/behaviors`。不让 Feed/Inbox/首页依赖 `@molis-ai/molis-work-plugin-functions`。不复活 Actions / Automation。不自动发邮件或执行写入。不改 `agent.mcp`。不宣称可发布。

## 方案与关键决策

- 函数库仍在 `{home}/functions/functions.db`；判断记录同库，带 subject（kind + id + 可选 board_id）。
- Choice 的选项 key 应对行为 id；不在名单里的丢掉。`needs_review` / 失败 / 没 Key → 建议为空，调用方用默认按钮。
- 行为公共名：`{plugin_slug}.{behavior_id}`；MCP 用已有正式工具名。
- 事件不是行为。判断完成发瘦通知，正文不塞结论。
- Inbox / 首页绑函数走各自 HTTP：`GET|POST /api/inbox/judgment`、`GET|POST /api/home/dock-judgment`。body 为 `{ function_key }`，`null` 或空字符串解开。Host 对已发布函数做 `functionFitsScene` 过滤后注入 `MolisWorkWebView.function_scenes`（`inbox_next_functions` / `home_dock_functions` / `feed_capture_functions`）。`inbox.next` 与 `home.dock` 都是 board 级绑定（无 ref）。产品开关在 Functions 编辑器，不在 Inbox 列表或首页详情。
- `latest(kind, id, board, scene_id)` 按场景取最近一条。Inbox 快照 `suggested_behavior_ids` 来自 `inbox.next`，Feed 来自 `feed.capture`，首页卡底另吃 `home_dock_suggested_behavior_ids`。
- `home.dock` 场景池含接着做 / 做完 / 忽略 / 重新授权 / 问问 / 打开。判断落地时的 `offered_behavior_ids` 按场景收窄：Inbox 下一步只有做完/忽略，Feed 捕捉是加入 Inbox / 保存 / 升格 / 忽略（`feed.open` 可映射「留在 Feed」），首页卡底是总表里对该对象已兑现路径的处置。`MolisWorkWebView.function_scenes.dock_behaviors` 把这些处置的 id、标题、对象类型交给首页。Feed 详情画按钮用 `visibleFeedDispositionIds`。动作范围见 [事件去向的动作范围](../function-scene-action-scope/spec.md)。
- `visibleDockBehaviorIds(suggested, offered, fallback)`：建议须落在收集名单里才亮；空或非法时用未绑时的默认对，不是把收集名单全画出来。

## 文件 / 模块边界

允许：`specs/archive/functions-system-capability/`、`packages/contracts`（functions 合同、Manifest 行为/场景）、`packages/plugin-runtime`（兑现 behaviors）、`modules/functions`、`plugins/native/functions`（变薄、board 级绑定 UI）、`plugins/native/feed` / `inbox` Manifest、规则字段与 Inbox HTTP、`apps/local-host` 行为总表、装配与首页绑函数 HTTP、`apps/workbench` 首页卡底消费建议、对应测试、SSOT / modules README 一行。

禁止：Feed/Inbox/首页 import Functions 插件实现；判断结果当 Artifact 主键。

## 验收标准

1. Module 能创建一次判断并按 subject 查询。
2. 插件 UI 仍能发布函数。
3. Host 能列出至少：现有 MCP 三项 + 首页/Inbox 现有动作（接着做、做完了、重新授权、问问怎么回事）。
4. 未绑函数时首页/Feed 与现在一致。
5. 绑了 Choice 后判断记录只含合法行为 id；未登记 id 丢掉。
6. 没 Key / 失败 / 说不准时默认按钮仍在。
7. 定向测试覆盖合同、记录落库、行为过滤、Feed/Inbox/首页不直接调 Functions 插件实现。
8. GET/POST `/api/inbox/judgment` 仍绑定或解开 `inbox.next`；未发布 key 返回 400。Inbox 列表不出现选择器。Functions 已发布的 Inbox 函数可「用在 Inbox」。
9. GET/POST `/api/home/dock-judgment` 仍绑定或解开 `home.dock`；未发布 key 返回 400。首页详情不出现选择器。Functions 已发布的首页函数可「用在首页」。
10. Inbox / 首页 HTTP 与 UI 不 import `@molis-ai/molis-work-plugin-functions`。Host 注入按场景过滤的已发布函数与 `JudgmentPort`。绑定不自动执行写入。
11. 未绑或建议为空时，Inbox 详情仍有「标记已处理」和「忽略」。
12. 落地建议只含 `inbox.done` 时，详情显示「标记已处理」，不显示「忽略」，「查看原消息」仍在。建议非法时退回默认按钮。点击建议按钮才改状态，判断本身不自动完成或忽略。
13. Feed 任务配置可从已发布函数里选一个绑到捕捉规则；未发布 key 返回 400，规则不落库。未选函数时捕捉与现在一致。
14. 落地建议只含 `feed.open` 时，详情不显示「加入 Inbox」，「打开原文 / 保存为资料 / 升格 Goal / 忽略」仍在。建议只含 `feed.promote` 时只显示升格。空或非法建议时四条处置都在。点击才写入，判断本身不自动加入 Inbox 或升格。
15. `GET /api/inbox/judgment` 的可选函数含内置 `system_pick_inbox_next`，不含 `system_admit_inbox`；把「是否进 Inbox」绑到 `inbox.next` 返回 400。
16. Feed 捕捉下拉含 `system_admit_inbox`，不含 `system_pick_home_dock`；把首页卡底函数绑到捕捉规则返回 400。`GET /api/home/dock-judgment` 含 `system_pick_home_dock`，不含 `system_admit_inbox`。
17. 同一对象上先跑 `inbox.next` / `feed.capture`、再跑 `home.dock` 后：Inbox 详情仍吃 `inbox.next` 建议，Feed 详情仍吃 `feed.capture` 建议，首页卡底仍吃 `home.dock` 建议，互不覆盖。
18. 首页卡底不再按四个 id 写死可画按钮。对一条 Inbox 事件：未绑时仍是「接着做」「做完了」，「说一句」仍在。绑了且建议为 `inbox.dismiss` 时亮「忽略」，即使忽略不在未绑默认对里。点击忽略走 Inbox `setStatus`，判断本身不改状态。MCP 工具名不出现在卡底。
19. app 插件 Manifest 声明了 `behaviors` 必须兑现 handler；只提供未声明 handler 或漏兑现时拒绝启动。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-runtime --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/plugin-manifest-v2.test.ts tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/home-flow.test.ts tests/plugin-outbound-mcp.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/feed-native-plugin.test.ts tests/feed-out-rules.test.ts
```
