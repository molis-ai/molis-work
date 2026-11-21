# BL-tests-umask · 让备份与恢复测试在两种常见文件权限设置下都测得准

有些电脑创建文件时默认权限更严。测试得先造出它声称要恢复的样本，否则可能把样本差异错报成恢复失败。

预计 **3–6 工时**。维护范围为工程流程。正式交付项为 [73-3](../../batches/73.md#batch-73-item-3)。[原始待办](https://github.com/molis-ai/molis-work/blob/d5dd1fbb6aec214c743e34fba9434f7f131ae6f1/specs/backlog/BL-tests-umask.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-tests-umask。正式交付项为 73-3，批次文件在 specs/post-anticorruption-roadmap/reference/batches/73.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。BL-tests-umask 已随 #2171 合入并删除条目，结清记录在 docs/backlog-removed.md。

目标
让备份与恢复测试在两种常见文件权限设置下都测得准。有些电脑创建文件时默认权限更严。测试得先造出它声称要恢复的样本，否则可能把样本差异错报成恢复失败。

实施
逐个核对 tests/security-invariants-home-restore-recovery.test.ts、tests/security-invariants-runtime-backups.test.ts、tests/home-snapshot-cli.test.ts、tests/home-restore-content.test.ts。只有夹具需要指定起始权限时才在创建后显式设定。保持恢复后权限断言的强度，勿改宿主或共用测试进程的默认权限。

验收
用两个独立子 shell 各跑同一组：分别设置 umask 022 和 umask 077，再用 node scripts/run-tests.mjs 运行上述四个文件。报告每组结果，同时证明恢复会保留样本权限。

协作
作为 73-3 的离线恢复前置回归。#2138 正改 home-restore-content.test.ts，其余三份可先查。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
