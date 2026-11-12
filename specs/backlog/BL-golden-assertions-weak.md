# BL-golden-assertions-weak

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-assertions-weak | 金样验收有两处断言偏弱：① `specs/upgrade-continuity/golden-replay-design.md:157` 的 UPG2-01 前半「金样只经主人的动作和设置入口生成」没有直接断言，`tests/golden-home.test.ts:205` 只测了后半「真实 Home 与临时目录外拒绝」；② 同文件 `:161` 的 UPG2-05「升级后重启一次，结构检查和全部读取再过一遍」在 `scripts/replay-golden-homes.mjs:236-237` 跑了 `restart-structure`、`restart-read`，但回放结果不带这两个步骤的记录，`tests/golden-home.test.ts:355-366` 只断言 `ok`、`reads>0`、`writes>0`、`versioned_files>0` 等——把 `:236-237` 两行删掉测试仍会过，既没断言重启步跑过、也没断言它单独通过。建议给重启步一个计数或步骤记录、测试断言它存在且大于 0；生成侧加检查证明金样只经动作与设置入口建立 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（U2 分册） | 已知缺口 | 金样回放本批刚接进 CI，验收先做到能复现读取与写入；弱化「重启也要过一遍」的断言不影响当前全绿 | U2 金样（#1957 已并入 #1979） | 中 | C1/U2（执行会话待分配） |
