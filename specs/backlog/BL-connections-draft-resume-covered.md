# BL-connections-draft-resume-covered

分组：6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-connections-draft-resume-covered | `tests/connections-page.e2e.test.ts` 的 ASC-76（「高级」里没保存的改动下次回来提示接着改）在 #1903 写手的一次本机批量运行里红过一次，报错是 `Covered … [data-draft-resume]`：「接着改」按钮被盖住。单独重跑通过；评审台在 merge-base 和 PR 头上各跑两次，都没复现。先观察：再红一次就查是谁盖住了按钮，不放宽断言，先不进隔离表 | [#1903](https://github.com/molis-ai/molis-work/pull/1903) 写手与评审台 | 已知缺口 | 只出现过一次，复现不了 | 无 | 低 | D／连接（执行会话待分配） |
