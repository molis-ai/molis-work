# 作者原始 Git 抽核（非独立审验）

以下从固定 Git 对象重新取值，逐项与 run-1 对照；没有引用测量脚本的解析函数。每端仅抽一例，不能替代独立数据审阅。

## B · fccb2a3003de86af556f0030923f9e76ddf369c7

- 巨大文件 `apps/local-host/src/assistant/assistant-service.ts`：`git show fccb2a3003de86af556f0030923f9e76ddf369c7:apps/local-host/src/assistant/assistant-service.ts` 按 `split("\n")` 手数 2700 行，阈值 >800；与逐文件记录一致。
- 内部引用 `tests/action-before-effect.test.ts:1`：`import { defineAction } from "../packages/plugin-sdk/src/actions.js";`；该端 Git 树的 workspace manifest 指向 `packages/plugin-sdk`；与逐处记录的 spec/owner 一致。
- PR #163 `fccb2a3003de86af556f0030923f9e76ddf369c7` 第一父 `6bcda25f1e12067e739158a2fc64a7f58abeefcd`：独立 `git diff-tree -r --name-status -M50%` 为 2 个文件事件；逐路径 manifest 映射的包目录 ['horizontal/agent-host']；与 PR 明细一致。
- 固定热点 `apps/workbench/src/i18n/en.ts`：对样本 70 个第一父 diff 逐一查 `--name-only -M50%`，命中 12 个 PR：[153, 159, 140, 130, 119, 118, 114, 108, 102, 98, 101, 96]；与热点记录一致。

## M · b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8

- 巨大文件 `apps/workbench/src/i18n/en.ts`：`git show b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8:apps/workbench/src/i18n/en.ts` 按 `split("\n")` 手数 3265 行，阈值 >800；与逐文件记录一致。
- 内部引用 `tests/action-call-log.test.ts:13`：`import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/dist/native-content-permissions.js";`；该端 Git 树的 workspace manifest 指向 `apps/local-host`；与逐处记录的 spec/owner 一致。
- PR #1688 `b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8` 第一父 `dc75e22bb6cf8947d827bb619f98b2029642d86f`：独立 `git diff-tree -r --name-status -M50%` 为 5 个文件事件；逐路径 manifest 映射的包目录 ['packages/design-system']；与 PR 明细一致。
- 固定热点 `apps/workbench/src/i18n/en.ts`：对样本 70 个第一父 diff 逐一查 `--name-only -M50%`，命中 3 个 PR：[1644, 1564, 1633]；与热点记录一致。


修订2沿用这些原Git抽核样本；涉及的units/hotspots等文件与首轮字节一致，PR包数未变，见revision-2/revision-check.json。公开名与非workspace分类的修正另由该定向核对记录覆盖，仍非独立审验。
