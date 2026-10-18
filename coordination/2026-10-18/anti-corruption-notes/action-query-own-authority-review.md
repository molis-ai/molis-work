# AQD own-action 报告独立复核

2026-10-18，最终收敛结论。只读 S 当前 action scope、Host route/control、own caller、SDK binder、Pages 内容 handler 与 HTTP fixture。未写 S、未运行构建/测试/浏览器。本文件替代同日最初草稿；不建议新增自主 owner 权源或扩展无原 caller 的 own fallback。

## 结论

未找到当前可信 PPT HTTP 入口仍丢失 Pages 权限的 P1。报告正确描述了无 control 普通 own fallback 的限制，但该路径没有原入口 caller；在已接受 AQD 的“没有原 caller 不借 owner”边界下，应拒绝跨插件委托，不能据此推导必须扩权。

当前真实链为：`web-request` 提供 `localWebActionContext(...LOCAL_OWNER_PERMISSIONS)` → Coding surface 的 `projectRouteControl` 保存原 caller → SDK `bindPluginActionRoute` 原样传 `request.execution` → `callScope` 命中 Host WeakMap → `routedActions` 保留 caller → action scope → `invokeQuery` 只收窄。Home route 也保存实际 caller。PPT 已接受迁移方案采用此 binder，因此不会走报告中的无 control own fallback。

现 `tests/fixtures/action-query.ts` 父动作没有 required_actions，声明 consumes content.read/list；真实 project HTTP 正向用例读取 Pages Markdown，实际经过 content.read→pages.get。它的 caller 不是 `plugin-action-query.test.ts` 手工 allowlist；权限来自真实 Host 路由。已有 HTTP fixture 手写 invoke 的参数与 SDK binder 关键传递一致，但用正式 binder 固定证据更精确。

## 必要验证收敛

1. 将正常 read fixture 改为真正 `bindPluginActionRoute`。断言父 manifest action 无 Pages required_actions、只有 consumes；记录进入父 handler 的原 caller 引用含 content.read 与 pages.get，且来自 Host 入口。调用真实内容 read，不能用只读 list 或 stub get 替代。
2. 对普通 `services.actions.invoke(own, input)` 无 control 路径明确断言 Pages 分支拒绝；text-only 分支成功且没有 Pages dispatch。无原 caller 不补回 owner 的 Pages 权限。
3. 保持原 control 正向、clone/direct/伪造 body 拒绝；保留 MCP/Agent 原 allowlist 限制，不由安装 grants 补回未授权目标或内部 pages.get。
4. Pages 未启用/无 grant 时 text-only 仍成功；不往父 outline/outline_ai 写无条件 Pages required_actions。

这些是对本报告所指缺口的精确证明；若实际 binder 测试失败，再沿真实 caller 传递定位生产修复。当前没有依据修改权限生产语义，也不需要新增 token registry、入口 scope 或依赖闭包机制。

## 为什么不能只改 allowlist

actionCaller 除 own+required allowlist 外，assertAuthority 也仅承认 own；invokeQuery 的 original.retainAuthority 又在原 context 上检查可见性。只给子 caller 加 content.read 既无法通过原 retention，又漏掉 Pages 的内部 get。把整套 fallback 放宽则会让复制 HTTP control 的调用获得原本没有的权限。这些限制应保留，而不是作为此次修复目标。

本次是当前共用 HTTP/SDK 链的只读判断，不替代 PPT 最终迁移后的产品实操验收。
