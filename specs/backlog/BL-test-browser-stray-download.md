# BL-test-browser-stray-download

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-test-browser-stray-download | `tests/images-result-whole-characters.e2e.test.ts` 在 CI 上偶尔失败：点下载后，下载目录里除了页面那个文件，还多一个 `downloads.html.crdownload`（7.8 MB，开头是 `Cr24`，是 Chrome 扩展包）。页面的下载事件里没有它，「Chrome 只存了一个文件」的断言就失败了。[#1960 的 Full](https://github.com/molis-ai/molis-work/actions/runs/42420938693) 第 2 次尝试首败、重试也败；[#1899 的 Full](https://github.com/molis-ai/molis-work/actions/runs/42337565087) 也遇到过一次，重试才过。测试浏览器经 `launchHeadlessChrome` 启动，标准参数已经带 `--disable-component-update` 和 `--disable-extensions`，这个下载还是会出现 | 第 02 批收尾（2026-11-08） | 已知缺口 | 来源没查清。本机没有专用测试浏览器，没有试过复现。要先查是 Chrome 的哪项服务借用了 `Browser.setDownloadBehavior` 设的目录，再决定在启动参数里关掉它，还是换别的办法。不为变绿放宽断言；`ppt-actions` 等别的下载用例可能也会撞上，一起看 | 无 | 低 | 测试基础设施（`packages/test-kit` 浏览器启动）与 Images 用例的主人（执行会话待分配） |
