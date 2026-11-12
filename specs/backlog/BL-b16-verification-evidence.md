# BL-b16-verification-evidence

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b16-verification-evidence | 第 16 批部分验证只有自述、原始证据不可复核：①`pnpm studio:replay smoke` 无执行记录（`CHAPTERS` 已改，AGENTS 要求跑；离线 `pnpm studio:replay` 有记录）；②首败「118 个文件各有定向复验」无逐文件清单/run；③B2/C 实操证据在本机 gitignore 目录与 `/tmp`，候选 `51897e9cba` 已不在任何 ref；④四页逐页首屏字节 artifact 不在树，只有预算文档 §6.7 与 PR 自述；⑤原生主窗只有 PR 自述。**2026-11-12 整改分支已补：** `pnpm studio:replay --base origin/main` 离线回放通过（基线记录仍成立）；`pnpm studio:replay smoke --stand-in` 在隔离 Home 通过（3/3 简报到设计冻结、首答全接受、0 修复轮，替身模型）——只证明接线，不证明真实模型。真实模型 smoke 仍未跑。**本机 first-screen 全门禁**在合入 #2032 后已可运行；它目前只剩「新语言包条目 + 页预算需 userApproval」（文字修复的预期增长，数字见 16.md 待用户决定⑦），不是环境问题。要做的：补真实模型 smoke（要用户批准）；把关键实操证据改成随 PR 入库的小体积脱敏 JSON（或明确接受「只有自述」并记录）；118 文件口径可不补清单，但写明判定依据 | [16.md「合后审计整改」](../post-anticorruption-roadmap/reference/batches/16.md#合后审计整改fix16-audit-followups)；合后审计 REPORT K10/附录 A | 已知缺口 | 主证据只在 PR 评论/本机；后续批建议改准入库小体积证据 | 主会话/Lead 决定是否补证 | 中 | 第 16 批主会话 / Lead（后续补证） |
