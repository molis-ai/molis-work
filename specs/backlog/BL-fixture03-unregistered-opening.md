# BL-fixture03-unregistered-opening

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-fixture03-unregistered-opening | FIXTURE-03 原来有「没有目录端口、打开动作未登记、处理器开始前就被拒、调用记录写 `refused: true`」这一种；`projects.directories.get` 现在总是登记，这一种在真实 Home 里造不出来，用例删了。被拒的诊断行仍由 R-47 的用例覆盖。要么找一个不改产品代码就能让它在开始前被拒的办法补回来，要么确认这条路径已不存在、在 spec 里删掉 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 已知缺口 | 迁到目录合同时这条前提没了 | 05② 目录合同（#1979） | 低 | C1（执行会话待分配） |
