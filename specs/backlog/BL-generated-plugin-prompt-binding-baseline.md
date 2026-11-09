# BL-generated-plugin-prompt-binding-baseline

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-generated-plugin-prompt-binding-baseline | `tests/generated-plugin-prompt-binding.test.ts` 在没有任何改动的干净基线上就失败：报「Plugin entrypoint」启动失败，原因没查。这条用例只在 macOS 上跑（`skip: process.platform !== 'darwin'`），走真实 Host 和沙箱，所以 Linux 的 CI 根本不跑它，本机又是红的，等于这条「已安装与创作台的模型调用各绑自己的发布」没有人在看。可能和 [BL-1064](BL-1064.md)（本机 Homebrew Node 的 libnode 被 Seatbelt 拦）是同一个原因，**没有验证**；换一份官方 24.15.0 的 Node 跑一次就能分清 | 第 14 批 T4～T10 的本机基线比对（干净基线工作树上同样失败） | 已知缺口 | 与第 14 批无关，没有为它查原因；先挂着，等 BL-1064 的 Node 问题处理后再跑一次，还红才是它自己的问题 | 可能是 [BL-1064](BL-1064.md)；见 [BL-seatbelt-tests-unrun](BL-seatbelt-tests-unrun.md)（沙箱用例没有固定跑的地方） | 中 | C1／沙箱与授权（执行会话待分配） |
