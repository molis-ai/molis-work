# 推进提示带上 Goal 的关联原文（原 BL-911）

状态：已实现，2026-11-11 第 27 批。用户先定方向（[决定 37](../../../post-anticorruption-roadmap/reference/decisions.md#decision-37) ②：只在本人受信页面按当前 Goal 精确查询后拼出，不放宽 S-08／S-43 的受众规则），同日在弹窗里选了下面的取法（插件在 Manifest 声明）。待办 BL-911 随之删除。

## 原来缺什么

Goal 页面终端面板的「推进这个 Goal」由 Goals 的 `goals.terminal.prompt@1` 给出提示。从 Feed 转成的 Goal，提示里应带着那条消息的原文（作为不可信数据），但原文只有 Feed 的 `feed.goals.context@1` 给，它只对 `user` 受众开放；Goals 以人的身份委托出去的调用按 S-43 算 `workflow` 受众，读不到。放宽受众会扩大谁能读个人数据，用户否掉了。

## 做法：插件声明「给某种对象的原文」，平台在本人页面按对象读

与 `stage_data` 同一套路：平台按 Manifest 声明、以本人身份调插件自己的只读查询，不认识任何插件的名字。

1. **合同**（`packages/contracts/src/platform/plugin-manifest.ts`，经 `platform/plugin` 导出）：Manifest 的 `ui.subject_context: [{ subject_kind: "goal", action }]`。`action` 是本 Manifest 自己的动作，只读、面向 `user`、只有一个版本（与 `stage_data` 同一条规则，SDK 的 `subjectContextProblems` 在解析 Manifest 时检查），每种对象一条；今天只有 `goal`。平台恰好以 `{ goal_id }` 调它，收 `{ source_context }` 或 `null`。上限：每个插件 12,000 个 UTF-16 单元（多的截断并标出，不拆字符），一次最多 4 个插件。Feed 声明 `feed.goals.context`。
2. **宿主**（`apps/local-host/src/subject-context-http.ts`）：`GET /api/host/subject-context?kind=goal&id=<goal_id>`，只收一个 kind、一个 id（id 最长 256 个字符，长了拒绝、不截）。对项目显示的、运行中的插件，按 Host 列插件的顺序，经与舞台读取同一个绑定（`bindLocalWebAction` 的 `stage_read`，只到那个插件自己声明的读取）以本人身份调用；没有在跑、被拒、不再提供的插件跳过，别的失败照常报给页面。不经委托，受众就是本人的 `user`。插件页面（`x-molis-plugin-page`）不在 `PluginPageAuthority.bind` 放行的路径里，被拒。
3. **Goals**：`goals.terminal.prompt@1` 的输入加可选 `source_contexts`（同样的条数与长度上限）。推进提示路由改成 POST，正文只带 `source_contexts`，查询参数仍只认 `onboarding`。有原文时照旧按 `goalAdvancePrompt` 包成 `UNTRUSTED_FEED_ITEM_DATA`（原文里的区块标记被换掉，关不上区块），可信指令只用 Goal 的 id 指代它。Goals 自己不读别的插件。
4. **终端面板**（`apps/workbench/src/terminal/client-prompt.ts`）：按当前 Goal 先读第 2 步的路由，再 POST 给 Goals 的提示路由；面板不点名任何插件。读不到原文时照旧给不带原文的提示。提示缓存按 Goal 记，换了 Goal 不会拿到前一个 Goal 的提示。

局限：只经有舞台的运行中实例读（与 `stage_data` 一样，用的是同一份运行中实例的清单）；没有舞台的插件声明了也不会被读。

## 验收

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| GAS-01 | 从 Feed 转成的 Goal，在终端面板「推进」得到的提示里有那条消息的原文，包在不可信数据区块里，可信指令只用 Goal 的 id，消息里的密钥不进提示 | `tests/desktop-tui.test.ts`（Feed 转 Goal 一例）、`tests/security-invariants-subject-context.test.ts` |
| GAS-02 | Agent、工作流、MCP、别的插件拿不到这段原文：声明只认本 Manifest 自己面向本人的只读查询，插件页面调这条路由被拒 | `tests/security-invariants-subject-context.test.ts`、`tests/security-invariants-plugin-pages.test.ts`（RAC-2516 一例） |
| GAS-03 | 换了 Goal 拿不到前一个 Goal 的原文；路由只收一个 kind 与一个 id；没有原文的 Goal 照旧给不带原文的提示 | `tests/desktop-tui.test.ts` |
