# BL-frame-container-double-read

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-frame-container-double-read | `tests/workbench-frame-container.e2e.test.ts` 在本机负载下偶发失败，失败在 `:477`（`storage does not start a second artifact GET`）和 `:491`（多读了一次）。读代码成立的机制：`apps/workbench/src/scripts/client/frame-container.ts:154-176` 的 `fillBody` 读完才写 `dataset.loaded`，读取途中再画一次就再发一次 GET。如果是这个机制，就是真实的多读，不只是用例问题。 | [#1939](https://github.com/molis-ai/molis-work/pull/1939) 写手比对，评审台核机制 | 已知缺口 | 不是 N22-02 带来的：基线也失败（同一槽位下头和基线各 8 次败 2 次；样本小，只能说基线也有，说不了两边一样），这段浏览器代码那一片没改。CI 上也出现过：[#1942 的全量](https://github.com/molis-ai/molis-work/actions/runs/42389162040/attempts/2) 第 27 分片两次尝试都败在 `the click reads its owner once`（`:284`），那个 PR 没碰这段代码；最近 30 次全量有 15 次失败，那 15 份日志里没有，但一个分片失败会取消其余分片，日志只看到先败的。根因没有证实，`:284` 这一条和上面的读取途中再画一次是不是同一个原因也没有查。一失败就挡住带全量的 PR，反复出现就该提前修。这个文件不在 `tests/ci-product-subset.txt` 和 `tests/quarantine.json`。 | 无 | 中 | 工作台 |
