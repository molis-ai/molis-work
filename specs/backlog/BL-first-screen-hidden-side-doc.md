# BL-first-screen-hidden-side-doc

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-first-screen-hidden-side-doc | 到达页、项目选择和工作台载入后，会在后台再取一份侧栏「问题收集」的完整 HTML（`/plugins/issues?side=capture`，工作台里是 `/projects/<id>/side/issues/capture`）：中文 492,614 B，英文 1,231,934 B，`no-store`，每次整份重发，里面还带完整语言目录。到达页和项目选择本来只用到达样式表，因此又多下载一份工作台样式表（1,109,009 B）和 `plugin-frame.js`（188,790 B）。到达页中文第一次打开，这一项共 1,790,413 B；英文再多约 74 万。今天的页面资源门禁不量它。要做的：先查它为什么在第一屏就取，再改成打开侧栏时再取，其余侧栏文档本来就是这样；改前改后都用 `scripts/first-screen-report.mjs` 量；到达页中文在 load 之前的传输只有 1,129,106 B，比全部的 2,921,408 B 少 61% | [字体皮肤语言的首屏实测与资源预算方案](../font-and-skin-system/resource-budget.md) 第 3.3、5、8 节（实测 `d125b36f5`，M5 Pro，3 次中位数） | 已知缺口 | 字体皮肤语言的实测顺带量出来，不属于它；改动在工作台外壳，由 D 轨排期，改完在第一屏总字节检查里应看到数字下降 | 第 16 批的第一屏总字节检查已随 #2031 合入（`scripts/gates/first-screen.mjs`、`tooling/gates/first-screen.json`），数字已进账；不等它也能先改 | 中 | D 外观与语言／工作台外壳（执行会话待分配） |
