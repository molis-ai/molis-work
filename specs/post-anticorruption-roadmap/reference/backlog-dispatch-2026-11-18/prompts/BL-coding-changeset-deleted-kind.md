# BL-coding-changeset-deleted-kind · 在 Coding 的本轮变更里列出确实删掉的文件

如果能证明这一轮成功删除了旧配置，变更清单就显示路径和「已删除」。只有一条删除命令或文件碰巧不见，还不够。

预计 **10–20 工时**。维护范围为B／Coding、Files 与 Git。正式交付项为 [99-1](../../batches/99.md#batch-99-item-1)。[原始待办](https://github.com/molis-ai/molis-work/blob/b428472f46/specs/backlog/BL-coding-changeset-deleted-kind.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-coding-changeset-deleted-kind。正式交付项为 99-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/99.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-coding-changeset-deleted-kind.md。产品决定与验收按该 BL 的现行记录。

目标
在 Coding 的本轮变更里列出确实删掉的文件。如果能证明这一轮成功删除了旧配置，变更清单就显示路径和「已删除」。只有一条删除命令或文件碰巧不见，还不够。

实施
用户已选按执行证据记录。追 plugins/native/coding/src/changeset.ts 的 createCodingChangeSet、routes-changesets.ts、browser/changeset.ts 和 results-document.ts。检查命令回执或子任务合并记录中可归给本轮的路径与成功结果，缺字段就从产生事实处最小补齐。保留旧清单可读，按实际覆盖范围描述证据，不编造原文或已做过文本评审。

验收
node scripts/run-tests.mjs tests/coding-changeset-http.test.ts tests/coding-change-html.test.ts。验普通命令与子任务两个确认删除入口、未证实／失败的删除、重复回执、旧清单重开，以及用户在固定清单看到的路径和状态。 涉及浏览器实操时用项目测试浏览器及隔离 Home。

协作
后端取证可先行。逐屏统一 PR #2142 已接续 #2139，并在改 Coding 的 browser/changeset.ts，界面接入交其负责人协调或等其落地。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
