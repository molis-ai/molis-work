# BL-images-result-download-crdownload-flaky

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-images-result-download-crdownload-flaky | `tests/images-result-whole-characters.e2e.test.ts` 在 CI 偶发失败：用例点下载后读下载目录的每个文件（第 98 行起），失败那次目录里多出 `downloads.html.crdownload`（Chrome 还没写完的临时文件），断言在第 144 行不通过；用例自己只等 8 秒或下载结束事件。[#1945 第一次全量](https://github.com/molis-ai/molis-work/actions/runs/42413910092)的分片 17/32 失败，同一个 run 的第二次尝试里这条已经过了（第二次是分片 4/32 另一条失败）。要先弄清是 Chrome 的结束事件和临时文件改名之间有空隙，还是用例读早了；不放宽断言，不靠重试销账 | [第 14 批 #1945 的全量，run 42413910092，job 128527756787](https://github.com/molis-ai/molis-work/actions/runs/42413910092/job/128527756787) | 已知缺口 | 只在这一次全量里见到；#1945 改的是助理回复语言，不是图片下载；没有复现步骤。再出现就拿干净的 main 工作树对比，按规则进 `tests/quarantine.json` | 无 | 低 | 工作台浏览器验证线（具体会话待分配） |
