# T-389 独立只读核验

结论：**有限诊断的输入、执行合同和原始结果可以核抵；原 Full 失败仍有效，根因及 H 对 M 的回归归属保持 UNKNOWN。** 本线未运行 H/M 测试、构建、GitHub 或 CI，也未修改两树。核验对象为 accepted T-389、作者 `/private/tmp/t389-evidence/REPORT.md` 与该目录原件。

## RAC-2831 · 输入、构建和隔离

- 独立回读 `/private/tmp/t389-dev/H` 为 H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`、tree=`908622b69189edcfed007efb26290d57a1c148c7`；`/private/tmp/t389-dev/M` 为 M=`6729a2d4655caa603daa369f99884e09c4726bde`、tree=`5df7692e7cf4affb0ca1942e8c1cf9ee29497066`。两树目前 Git clean，原测试已恢复。M→H 实际只有 storage/Home store、相关文档/测试/owner 十路径；M→构建来源 `45abd242013a428d79e750503159ee580fa33ba7` 只差 `tests/workbench-stop-feedback.e2e.test.ts`。因此该来源不冒充 M 整树，差项也不在旅程测试或生产构建摘要输入。
- 按 `apps/local-host/src/installer/fingerprint.ts` 的路径、排序、文件模式、symlink/目录/文件编码独立用 Python 重算：H=`f115740ff71b5f074c6ec6b9a70fcffb53b322db4c04dd3f7fad5da40856d2db`，M=`ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872`；均等于各自 `.molis-work-build.json` 和作者 prepare/test result。两来源与两目标的全部 11,287 个 dist 文件，相对路径和逐文件 SHA-256 分别完全相同。`prepare.log` 的 frozen/offline install 自然退出 0，没有重建生产产物。
- 作者 `prepare-result.json`、`test-H-result.json`、`test-M-result.json` 给出实际 Node `import.meta.resolve` 的六入口。独立回读对应 `node_modules` symlink 均指向该侧自己的包，记录的六个 dist 路径存在且在该树内；不存在借用来源树 dist 的证据。原测试从 Git 对象重读与两份 `*-original-test.ts` 逐字一致，SHA-256 同为 `348cc75954f021cb4183e0c645224b746148e612b63c460cfafe90a5af3c8d29`；七个直接 helper/配置当前字节和作者记录 SHA、对应 Git 对象相同。`input-binding.json` 中测试路径的 SHA 是**运行时诊断版**，清理后的工作树测试文件是原版；两者各与保存的诊断版/原版 SHA 一致，这个当前路径 SHA 差异是预期恢复结果。
- `run.py` 在公共 build/browser 槽内执行；三份 result 的 before/after holder `pid/since` 各自相同，原始日志有命令与隔离环境。M 的槽 holder `cwd` 是外层启动目录 H，内层 `COMMAND ... CWD /private/tmp/t389-dev/M` 与 result head/tree 证明 M 测试在 M 树执行。专用 browser 包装脚本实际转到 `molis-test-browser --use-mock-keychain --password-store=basic`；环境配置隔离 Home、XDG、TMPDIR，file secret backend。`cleanup.json` 记 fixture Home/自有进程为空及九个 runtime 目录清理；本线回读九目录均不存在，两树 clean，8 张所列 PNG 均存在且非空。原生 Foundation 临时目录未单独核，隔离结论按作者限定保留。

## RAC-2832 · 原路径和观测

- `test-H.log` 与 `test-M.log` 各只有一次完整 `tests/project-user-journey.e2e.test.ts` 命令，`--jobs 1 --retries 0 --verbose`，对应 `.exit` 均为 0；H 的 1440/390 为 11.048/9.854 秒，M 为 9.284/8.650 秒，均 2 pass、0 fail/skip/cancel/todo。结果属于 Mac 上带诊断观测的两次执行，不能写成 Linux CI 的无观测重放。
- H/M 诊断文件只对同一测试插入观察器、失败截图与 finally 导出；两份除输出侧路径外相同。原 `await plugin('feed'); await click(add-toggle); await click(custom_rss);` 在每份文件中逐字相邻，原 `goal-browser.ts` 未改。观察器在此前一次 CDP evaluate 安装；该三调用之间没有新增 await/CDP/日志/重采样。第一次新增 stop evaluate 与磁盘写入均在 custom_rss 调用返回或抛错之后；成功路径因此在原下一步 fill 之前多了一次往返。事件监听、MutationObserver、初始/终态 geometry 采样会增加 CPU/分配或改变布局刷新与调度，不能当作无扰动对照。
- 独立从四份原始 JSON 重算：可信 add click 为 H1440/H390/M1440/M390 的 108.9/126.3/93.0/129.4ms；dialog `hidden` 去除的回调为 115.8/134.2/99.6/137.4ms；可信 custom_rss click 为 208.2/516.4/192.3/211.5ms。原始点击事件都在保留缓冲内，add 为初始 rail 按钮 id21；custom 事件在初始 choice id20 或其子节点，祖先链无 `hidden`/`inert`。顶层初始/终态各仅匹配一份 Feed root/dialog/choice；初始 id8/16/20 到终态保持，终态 Feed tab 被选、feedView=add、dialog 可见；四份 browserErrors 均空。这只描述本轮四条成功路径。其余可访问 iframe 在快照中无 Feed 匹配，但各有一次 `iframe-unavailable`，不能证明不可访问帧或所有中间时刻无副本。
- 四份原始 `events` 均满 500，`dropped` 依次 5/6/5/6；最后保留事件在可信 custom click 后，终态快照另存。丢弃分支仅增计数，未保存 kind/目标/时间或值；无法恢复尾部状态变化，更不能说只丢了无关 mutation。MutationObserver 的 ms 是回调时间，属性 value 是回调读取值，不能当 setter 的准确时序。原始截图只有每侧 1440/390 的 goal-recorded 与 inbox-from-feed 四张；本轮无失败截图，因为没有失败。

## RAC-2833 · 证据边界与裁决

原 T385 shard11 日志复制品与 `/private/tmp/t385-verify/ci/full-11-124744120267.log` SHA-256 同为 `2a97024e81bcdddfe9240a488af5dcc32860e00aae7c7c6a7b14b3a17c67a3df`；其 checkout 是 GitHub 生成的测试 merge `6cceb92f4…`，首轮及 retry 均 1440 pass、390 在原第 60 行报 `Hidden click target: [data-feed-choose-kind=custom_rss]`。本轮独立 H/M 本地运行不是该 Linux merge 输入；旧失败不撤销。

本次可判：在受观测扰动的 Mac 条件下，H/M 各一次的两条完整旅程通过，单一顶层 Feed 实例的 add/choose 正常发生。仅能排除“错文档/重复面板、未打开、hidden/inert祖先”作为**本次成功路径的表现**。旧 CI 失败当时的 DOM 身份、布局和内部 showFeedSetup/setFeedTask 顺序没有现场证据；H 相对 M 的回归、storage 因果、CSS、消息或同步问题均 UNKNOWN。T384 兄弟候选的 2/2 不能替代 M，对本结论没有倒签作用。

与 accepted WO 一致，本阶段到此停止，不因绿色或尾部截断补跑。若根决定继续收口，下一次本来计划的 Linux 完整文件执行前，应先在同一 WO 裁定观测预算与首败现场采集方式；目前没有已证的产品修法或可签的 Full 通过。
