# BL-plugin-cli-dev-uncoded-errors · 让插件试跑失败时说清楚到底错在哪

作者用了不合适的目录，或漏了本地试跑参数，现在都可能被告知「插件说明写错了」，会去修错地方。

预计 **3–6 工时**。维护范围为C1／合同与 SDK，工具维护人。正式交付项为 [48-1](../../batches/48.md#batch-48-item-1)。[原始待办](../../../../backlog/BL-plugin-cli-dev-uncoded-errors.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-plugin-cli-dev-uncoded-errors。正式交付项为 48-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/48.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-plugin-cli-dev-uncoded-errors.md。产品决定与验收按该 BL 的现行记录。

目标
让插件试跑失败时说清楚到底错在哪。作者用了不合适的目录，或漏了本地试跑参数，现在都可能被告知「插件说明写错了」，会去修错地方。

实施
沿 tooling/plugin-cli/src/cli.ts 的 dev、validate 错误边界到 apps/local-host/src/local-plugin-development.ts 的 runLocalPluginDevelopment。盘点其中无代码的拒绝，按现有 defineErrorCodes 和错误主人登记具体原因。Manifest 校验保留自己的错误。更新 docs/platform/PLUGIN-DEVELOPMENT.md 的旧限制说明。入口用 Molis Work 自带的 molis-work plugin。

验收
从 CLI 入口分别试普通非空目录、漏 --allow-unsigned-development、确实无效的 Manifest，核对可机器读取的不同错误、退出状态、原目录内容。跑 node scripts/run-tests.mjs tests/plugin-authoring.test.ts tests/plugin-sample.e2e.test.ts。 涉及浏览器实操时用项目测试浏览器及隔离 Home。

协作
可独立先修，作为 48-1 作者隔离试用的失败路径验收。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
