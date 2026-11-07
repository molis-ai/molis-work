# BL-probe-plugin-esbuild

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-probe-plugin-esbuild | `tests/probe-plugin.test.ts` 在 macOS 上过不了：测试拷贝仓库后跑 `pnpm install --offline --frozen-lockfile=false`，拷贝里 `esbuild` 还在，`@esbuild/darwin-arm64` 不在了，探针的 `POST /notes` 返回 503，夹具接着读 `note.id` 报 `TypeError`。临时补回这个包后用例整条通过。要修这个测试的安装，并确认真实安装不会丢这个包。这个文件只因第 25 行有 `darwin` 被标成 macOS 专属，Full 跳过它，可能是误判，一并看 | #1837 合入后的 macOS 复核 | 明确后续做 | 还没修。#1837 合入前的 `734667a28` 和合入后都是同样的 503，不是 #1837 引入。真实安装会不会丢这个包没查；`apps/local-host` 运行时要用 esbuild，所以不能先当成只和测试有关 | 无 | 中 | 插件平台维护人（具体会话待分配） |
