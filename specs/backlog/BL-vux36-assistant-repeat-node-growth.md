# BL-vux36-assistant-repeat-node-growth

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-vux36-assistant-repeat-node-growth | `tests/assistant-repeat-no-accumulation.e2e.test.ts`（VUX-36）在慢机上会红：同样的操作重复做，节点从 3413 涨到 3477（+64），监听器从 418 涨到 436（+18）。在 main `8d8aa76a` 的干净工作树上用 CPU 降速 6 倍连红三次；不降速时两边都不涨。已经排除的位置：主文档里挂着的元素与文本、window 与 document 上的监听器、页面自己 realm 里脱离了文档但还活着的元素（`Runtime.queryObjects`），以及经 replaceChildren、remove、innerHTML 删掉的元素。多出来的节点在页面 realm 之外，最像是 iframe 换掉的旧文档还被谁拿着，谁拿着没有查到 | [#1879 写手评论](https://github.com/molis-ai/molis-work/pull/1879#issuecomment-6706240412)；评审台复核同意 | 已知缺口 | 不是第 18 批带来的；要用 CDP 堆快照找出持有旧文档的引用，第 18 批不碰 Assistant 页面。不放宽断言 | — | 中 | 助理线（执行会话待分配） |
