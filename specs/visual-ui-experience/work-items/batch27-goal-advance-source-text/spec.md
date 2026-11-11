# 推进提示带上 Goal 的关联原文（BL-911）

状态：设计稿，2026-11-11 第 27 批主会话写，取法待用户在弹窗里定；用户已定方向（[决定 37](../../../post-anticorruption-roadmap/reference/decisions.md#decision-37) ②：只在本人受信页面按当前 Goal 分别精确查询后拼出，不放宽 S-08／S-43 的受众规则）。

## 现在缺什么

Goal 页面的终端面板有「推进这个 Goal」：Goals 的 `goals.terminal.prompt@1` 给出提示，交给终端里的编程 Agent。从 Feed 转成的 Goal，提示里应当带着那条消息的原文（作为不可信数据，`goalAdvancePrompt` 已有这一段），但现在拿不到：原文只有 Feed 的 `feed.goals.context@1` 给，它只对 `user` 受众开放；Goals 以人的身份委托出去的调用按 S-43 算 `workflow` 受众，所以被拒。放宽受众会扩大谁能读个人数据，用户已否掉。

## 推荐取法：插件声明「给某种对象的关联原文」，平台在本人页面按对象读

和 `stage_data` 同一套路（平台按 Manifest 声明、以本人身份调插件自己的只读查询，不认识任何插件的名字）：

1. **合同**：Manifest 的 `ui` 加一项声明，例如 `subject_context: [{ subject_kind: "goal", action: "<本 Manifest 自己的只读查询>" }]`。查询只给 `user` 受众、`operation: "query"`，平台恰好以 `{ goal_id }` 调它，返回 `{ source_context: string } | null`。Feed 用它声明 `feed.goals.context`。
2. **宿主**：一条本人页面的读取路由（例如 `GET /api/host/subject-context?kind=goal&id=<goal_id>`）：在这个项目里对每个声明了这种对象的运行中插件，以本人、项目与那一个动作自己的权限调用，收集非空的结果（带插件名）。不经委托，所以受众就是本人的 `user`，S-08／S-43 不变。
3. **Goals**：`goals.terminal.prompt@1` 的输入加可选 `source_context`（有长度上限），推进提示路由改收 POST 正文；有原文时照旧按 `goalAdvancePrompt` 包成 `UNTRUSTED_FEED_ITEM_DATA`，可信指令只用 Goal 的 id 指代它。
4. **终端面板**（工作台）：按当前 Goal 先读第 2 步的路由，再把结果交给 Goals 的提示路由；面板不点名任何插件。读不到原文时照旧给不带原文的提示。

要补的证据：新安全记录或扩 S-08，拒绝用例覆盖「Agent、工作流、MCP、别的插件调这条路由或那个查询被拒」「声明的动作不是本 Manifest 自己的、不是只读查询、不只给 user 时安装被拒」「换了 Goal 的页面拿不到别的 Goal 的原文」。合同快照（API、动作）随之刷新。

代价：改一处 Manifest 合同、加一条宿主路由与一条安全记录；任何插件以后都能用同一声明给 Goal（或别的对象）提供原文，不只 Feed。

## 另外两种取法

- **工作台直接认 Feed 的路由**：最快，但等于在平台里给 Feed 开私路，违反「插件同等待遇」。不推荐。
- **本批不做，BL-911 留着**：推进提示继续不带原文。

## 验收（定下取法后细化）

| 编号 | 内容 |
| --- | --- |
| GAS-01 | 从 Feed 转成的 Goal，在终端面板「推进」得到的提示里有那条消息的原文，包在不可信数据区块里，可信指令只用 Goal 的 id |
| GAS-02 | Agent、工作流、MCP、别的插件拿不到这段原文；放宽受众的调用被拒（安全记录的拒绝用例） |
| GAS-03 | 切到别的 Goal 后，面板拿不到前一个 Goal 的原文；没有原文的 Goal 照旧给不带原文的提示 |
