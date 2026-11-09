# S-ui-text-page

| 不变量 | 被拒绝的事 | 代码位置 | CI 里跑 | 只在本机跑 |
| --- | --- | --- | --- | --- |
| S-ui-text-page | 插件词包批取只接受持有原页面会话证明和 cookie 的同源父文档，插件和情境页面的请求头均拒绝。请求只选本项目实际签发的挂载；另一个会话、项目、Home、未知或已关闭的页面不提供任何包。宿主在异步范围复核之后按当前页原激活对象读取，不会用相同安装 ID 和代次的新激活替换旧页；一个批次混入无效挂载时整批拒绝。共有包只含 `common.*`。 | `apps/local-host/src/web-ui-locales.ts`、`apps/local-host/src/plugin-page-authority.ts` 的 `withPageText`、`apps/local-host/src/web-sessions.ts` 的 `captureWebSessionAuthority` | `tests/security-invariants-ui-text-page.test.ts`「S-ui-text-page FSS-09 FSS-37 only the originating shell can batch exact running mounts」 | — |
