# T391 本地文案核验交接

已完成本地候选并交回唯一 writer。M `15ad4f397018241c8b31625aff8014b89259f239`；H `8c1970313438137b19f114fe9b7ae4f3392f6687`；tree `8762ccd9b471c21cd0c34fde3e02616620003f5f`。树 `/private/tmp/t391-dev`，分支 `feature/t391-extension-points-doc`，状态干净，唯一 diff 为 EXTENSION-POINTS 的指定10行（+10/−10）。

RAC-2837：15个旧外加项全部改为另需 SSOT 文档一行；旧词项搜索无命中（rg exit1 是预期无匹配），不再指示手加 assembly 名单。RAC-2838：现行登记/门禁来源已与源码核对；77行标「历史目标推演」、253行标「按当时模型」。历史数字、未重测说明、五项推演、原 X1 括号、T148 整个终端段和全部其它行保留；没有重新计量成本或修改其它 owner 段落。

RAC-2839：人工完整核读口径、插件总表/3.1、F1/F5；表格 pipe 列数不变，仓库现有 brokenLinks 对全部 tracked live Markdown 返回0问题，现有 readMarkdown 核行内代码及其行号完全相同，diff-check通过。EXTENSION-POINTS 不属于 skills/AGENTS/CALL-CHAINS 的行内引用门禁覆盖范围，未冒称该规则检查了本文件所有历史代码名；本次未增路径/链接 token。所有机器检查消费的文档 blob 与提交 H 相同。

实际 affected 为 `tests=[]、full=[]`，本片建议 full=false。没有 build、浏览器、新测试、全量 health/boundary；affected 的通用建议没有覆盖本单明确的最小文案验证合同。未 push/GH/CI、未改协调账/门禁。一次作者辅助正则比较误读 fenced block，已改用仓库现有 Markdown reader，原件保留；未因此修改文档或放宽规则。

所有静态命令自然退出；没有创建浏览器/profile、测试 Home 或常驻进程，无此类资源需清理。工作树与原件保留，作者停止写入，独立验证/二审和发布由根安排。

原件：[完整绑定](/private/tmp/t391-evidence/FINAL-STATE.json)、[实际 diff](/private/tmp/t391-evidence/candidate.patch)、[10行/15项范围核对](/private/tmp/t391-evidence/scope-check.json)、[检查命令及退出](/private/tmp/t391-evidence/checks.json)、[现有文档链接检查](/private/tmp/t391-evidence/doc-links.raw)、[现有 Markdown reader 比较](/private/tmp/t391-evidence/inline-code-check.raw)、[affected](/private/tmp/t391-evidence/affected.raw)、[最终 diff-check](/private/tmp/t391-evidence/final-diff-check.raw)、[辅助比较记录](/private/tmp/t391-evidence/CONTROL-NOTE.md)。
