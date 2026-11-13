# BL-feed-wake-resets-page

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-feed-wake-resets-page | Feed 翻到后面的页时，每 30 秒会被弹回第一页。平台的时钟每 30 秒叫醒一次 Feed（`plugins/native/feed/src/runtime-wake.ts` 的 `feed.sources.wake`，`FEED_WAKE_INTERVAL_MS`）。这次叫醒即使什么也没拉到，也算一次成功的命令，宿主照样把 Feed 的视图版本加一（`apps/local-host/src/project-host.ts` 的 `hostCallSettled`）。页面 1.5 秒内读到新版本，发出 `invalidate`（`apps/workbench/src/browser/plugin-frame/parent.ts` 的 `observeFrameRevision`）；Feed 把它当通知，先 `stage.resetPage()` 再读第 0 页（`plugins/native/feed/src/browser/factory.ts` 的 `page.refresh("notice")`）。看第 200 条往后的人因此被带回最新一页，展开的材料分页也一样。分页是 #2026（11-11）加的，时钟叫醒 11-06 起就有。**复现**：`node scripts/run-tests.mjs --jobs 1 tests/feed-capture.e2e.test.ts --test-name-pattern=FBR-07`，现在的 `main` 上本机 4 次红 4 次；诊断行里的 `pagingTrace` 先是 `{"selection":{"invalidate":true}}`，接着是 `offset: "0"` 的读取。在宿主的 `hostCallSettled` 里临时打日志，能看到 `feed.sources.wake` 的时刻正好落在用例切语言的那几秒；b819373250 上碰巧没落进去，所以那时是绿的 | #2046 的全量（run 43389084767，`feed-capture.e2e` FBR-07 重跑也红） | 产品缺陷 | 要在产品里定：没拉到新东西的叫醒不加视图版本，或者 Feed 收到通知时保留所在的页；不在测试一侧遮过去 | 无 | 高 | Feed、平台（视图版本） |
