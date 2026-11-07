# BL-browser-site-decisions-unreadable

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-browser-site-decisions-unreadable | 侧栏浏览器的 `browser/sites.json` 读不出来（不是 JSON）时，`BrowserSiteDecisions` 当作没有决定：拦过的站点不再拦，助理可以用浏览器；下一次保存还会把坏文件盖掉，人设过的拦截就没了（`apps/local-host/src/browser/browser-surfaces.ts` 的 `read()`）。同类的「助理用电脑的设置」读不出来时是关掉总开关，两处方向相反 | 第 02 批复查（2026-11-08），写发布检查单第 3 节时读代码发现 | 已知缺口 | 坏文件被覆盖这一半由第 05 批的 U1-e 修（[升级链设计](../upgrade-continuity/upgrade-chain-design.md) §2.6：读不了时用内存默认、拒绝写）；修完之后，读不了的那段时间里拦截照样放开。坏文件时怎样是产品判断（保持拦截并提示、关掉侧栏浏览器，还是现在的放开），要用户定；不属于第 02 批的版本清理 | U1-e | 中 | C2／侧栏浏览器（执行会话待分配） |
