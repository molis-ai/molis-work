# S-ui-text-page

| 不变量 | 被拒绝的事 | 代码位置 | CI 里跑 | 只在本机跑 |
| --- | --- | --- | --- | --- |
| S-ui-text-page | 插件词包批取只接受持有原页面会话证明和 cookie 的同源父文档，插件和情境页面的请求头均拒绝。请求只选本项目实际签发的挂载；另一个会话、项目、Home、未知或已关闭的页面不提供任何包。宿主在异步范围复核之后按当前页原激活对象读取，不会用相同安装 ID 和代次的新激活替换旧页；一个批次混入无效挂载时整批拒绝。共有包只含 `common.*`。不透明框在原 `srcdoc` 用一次性挂载凭据与持有的端口发起握手；首个加载前改去其他文档时，不能凭现有窗口收到配置或端口。 | `apps/local-host/src/web-ui-locales.ts`、`apps/local-host/src/plugin-page-authority.ts` 的 `withPageText`、`apps/local-host/src/web-sessions.ts` 的 `captureWebSessionAuthority`、`apps/workbench/src/browser/plugin-frame/entry.ts` 与 `parent.ts` 的握手 | `tests/security-invariants-ui-text-page.test.ts`「S-ui-text-page FSS-09 FSS-37 only the originating shell can batch exact running mounts」「S-ui-text-page FSS-09 a scope that ends during the batch check delivers no language pack」；`tests/security-invariants-plugin-pages.e2e.test.ts`「S-ui-text-page FSS-08 a replacement document before first connection never receives the frame port」 | — |
