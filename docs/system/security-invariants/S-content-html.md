# S-content-html

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-content-html | D0103：跨插件返回的非交互内容在 SDK 的惰性 DOM 白名单入口消费，拒绝脚本、事件属性、表单提交、嵌入文档、媒体资源、危险链接与 SVG 资源引用。保留正文、表格、代码、差异折叠及文件选择的有限展示属性；仅允许 ol 的完整 style 为固定属性 --diff-digits 加一到两位数字，混入其他 CSS、URL 或无界数字均拒绝；不把任意 data-action 当权限。已声明交互卡片仍走原平台渲染与动作授权，不属于任意内容 HTML | `packages/plugin-sdk/src/browser.ts` 的 `setContentHtml`、`contentHtml`（含共用只读词汇，保持浏览器入口无 import）；Coding、Git、Shelf 的内容消费者 | `tests/security-invariants-content-html.e2e.test.ts`「shared content boundary refuses executable markup」 | — |
