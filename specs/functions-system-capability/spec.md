# 判断成为系统能力：函数、行为、一次判断记录

完成等级：**3 功能可用**。不宣称可发布。

## 背景目标

把 Functions 从「给 Agent 用的个人插件」做成系统常驻判断能力。系统里有判断（看一眼、给结论）和能做的事（已登记行为）。判断只负责看和挑；真动手交给拥有该行为的插件。

## 当前行为与问题证据

- 函数库和调用在 `plugins/native/functions`；对外只有 MCP `list` / `describe` / `invoke`。
- 输入是一段文本，输出是 JSON，不落一次判断实体。
- 首页第三栏按钮写死在 `apps/workbench/src/scripts/client/project-home.ts`。
- Feed 捕捉规则只有关键字。
- Artifact 不能当判断身份。Feed / Inbox / 首页不能 import Functions 插件实现。

## 范围

1. 新增 `modules/functions`：已发布函数 + **一次判断**实体。别人只调合同。
2. Functions 插件变薄：写、试跑、发布、配 Key、HTTP/UI。库和判断记录在 Module。TypeSafe 由 Host 注入。
3. Host 合成行为总表：`mcp_exports`、插件 Manifest `behaviors`、系统首页/Inbox 现有动作。判断只能从这份名单里挑。插件可任意登记行为，不必是 MCP。
4. 判断先落判断记录；事件只通知 `judgment_id`。建议可以只显示。写行为不自动执行。`home.talk`（说一句）不进判断池，不能被藏掉。
5. 场景绑定在现场，不另做总控台：Feed 规则可选 `function_key`；Inbox 列表有 `inbox.next` 选择器；首页详情有 `home.dock` 选择器。落地时（Inbox 创建 / 捕捉命中）再判断，不在点开第三栏时打模型。
6. Manifest 可声明 `behaviors`、`function_scenes`、`judgment_subjects`，以及 `requires` 判断能力。

## 非目标

不把判断身份做成 Artifact。不新建 `modules/judgments`、`plugins/native/behaviors`。不让 Feed/Inbox/首页依赖 `@molis-ai/molis-work-plugin-functions`。不复活 Actions / Automation。不自动发邮件或执行写入。不改 `agent.mcp`。不宣称可发布。

## 方案与关键决策

- 函数库仍在 `{home}/functions/functions.db`；判断记录同库，带 subject（kind + id + 可选 board_id）。
- Choice 的选项 key 应对行为 id；不在名单里的丢掉。`needs_review` / 失败 / 没 Key → 建议为空，调用方用默认按钮。
- 行为公共名：`{plugin_slug}.{behavior_id}`；MCP 用已有正式工具名。
- 事件不是行为。判断完成发瘦通知，正文不塞结论。
- Inbox / 首页绑函数走各自 HTTP：`GET|POST /api/inbox/judgment`、`GET|POST /api/home/dock-judgment`。body 为 `{ function_key }`，`null` 或空字符串解开。published 列表由 Host 从 Module `listPublished` 注入。首屏 select 可吃 `MolisWorkWebView.function_scenes`。`inbox.next` 与 `home.dock` 都是 board 级绑定（无 ref）。

## 文件 / 模块边界

允许：`specs/functions-system-capability/`、`packages/contracts`（functions 合同、Manifest 行为/场景）、`packages/plugin-runtime`（兑现 behaviors）、`modules/functions`、`plugins/native/functions`（变薄）、`plugins/native/feed` / `inbox` Manifest、规则字段与 Inbox HTTP/UI、`apps/local-host` 行为总表、装配与首页绑函数 HTTP、`apps/workbench` 首页卡底消费建议与详情选择器、对应测试、SSOT / modules README 一行。

禁止：Feed/Inbox/首页 import Functions 插件实现；判断结果当 Artifact 主键。

## 验收标准

1. Module 能创建一次判断并按 subject 查询。
2. 插件 UI 仍能发布函数。
3. Host 能列出至少：现有 MCP 三项 + 首页/Inbox 现有动作（接着做、做完了、重新授权、问问怎么回事）。
4. 未绑函数时首页/Feed 与现在一致。
5. 绑了 Choice 后判断记录只含合法行为 id；未登记 id 丢掉。
6. 没 Key / 失败 / 说不准时默认按钮仍在。
7. 定向测试覆盖合同、记录落库、行为过滤、Feed/Inbox/首页不直接调 Functions 插件实现。
8. Inbox 列表可 GET/POST `/api/inbox/judgment` 绑定或解开 `inbox.next`；未发布 key 返回 400；页面出现现场选择器。
9. 首页详情可 GET/POST `/api/home/dock-judgment` 绑定或解开 `home.dock`；未发布 key 返回 400；详情里出现现场选择器。
10. Inbox / 首页 HTTP 与 UI 不 import `@molis-ai/molis-work-plugin-functions`。Host 注入 `listPublished` 与 `JudgmentPort`。绑定不自动执行写入。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-runtime --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/plugin-manifest-v2.test.ts tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/home-flow.test.ts tests/plugin-outbound-mcp.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts
```
